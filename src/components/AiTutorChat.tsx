import { useEffect, useRef, useState, type FormEvent } from 'react';
import { streamTutorChat } from '../api/client';
import type { ChatMessage } from '../types/chat';
import { MarkdownRenderer } from './MarkdownRenderer';

type AiTutorChatProps =
  | { mode?: 'question'; questionId: string; selectedKey: string | null; isCorrect: boolean }
  | { mode: 'subject'; subjectName: string };

function buildInitialPrompt(selectedKey: string | null, isCorrect: boolean): string {
  if (isCorrect && selectedKey) {
    return `Marqué correctamente la opción ${selectedKey}. ¿Me podés explicar paso a paso por qué es la respuesta correcta y cómo descartar las demás?`;
  }
  if (selectedKey) {
    return `Elegí la opción ${selectedKey} y me equivoqué. ¿Me explicás paso a paso cómo resolver correctamente esta pregunta?`;
  }
  return 'Dejé esta pregunta en blanco porque no estaba seguro de cómo resolverla. ¿Me guiás paso a paso?';
}

/**
 * Tutor IA con dos modos:
 * - `question` (por defecto): contextualizado a una pregunta puntual en pantallas
 *   de revisión. Dispara automáticamente la primera consulta contra `POST /api/chat`
 *   con `questionId` para que el backend inyecte el contexto oficial.
 * - `subject`: chat general por materia, sin `questionId` (el backend responde
 *   sin contexto de pregunta puntual). El panel queda abierto desde el inicio
 *   y el alumno escribe libremente sus dudas conceptuales.
 */
export function AiTutorChat(props: AiTutorChatProps) {
  const isSubjectMode = props.mode === 'subject';
  const questionId = props.mode === 'subject' ? undefined : props.questionId;

  const [isOpen, setIsOpen] = useState(isSubjectMode);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingContent, setStreamingContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [wasCached, setWasCached] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const requestTutorTurn = async (conversation: ChatMessage[]) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setMessages(conversation);
    setStreamingContent('');
    setIsStreaming(true);
    setError(null);

    let accumulated = '';

    try {
      const { cached } = await streamTutorChat(
        { messages: conversation, questionId },
        (chunk) => {
          accumulated += chunk;
          setStreamingContent(accumulated);
        },
        controller.signal,
      );

      if (controller.signal.aborted) return;

      if (cached) {
        setWasCached(true);
      }

      if (accumulated.trim().length > 0) {
        setMessages([...conversation, { role: 'assistant', content: accumulated }]);
      }
      setStreamingContent('');
    } catch (err) {
      if (controller.signal.aborted) return;
      const message =
        err instanceof Error ? err.message : 'No se pudo conectar con el tutor IA.';
      setError(message);
      setStreamingContent('');
    } finally {
      if (!controller.signal.aborted) {
        setIsStreaming(false);
      }
    }
  };

  const handleToggleOpen = () => {
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);

    if (nextOpen && messages.length === 0 && !isStreaming && props.mode !== 'subject') {
      const firstPrompt = buildInitialPrompt(props.selectedKey, props.isCorrect);
      void requestTutorTurn([{ role: 'user', content: firstPrompt }]);
    }
  };

  const handleFollowUpSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed || isStreaming) return;

    setInputValue('');
    void requestTutorTurn([...messages, { role: 'user', content: trimmed }]);
  };

  const placeholder =
    props.mode === 'subject' ? `Preguntá algo sobre ${props.subjectName}…` : 'Preguntá una duda sobre este paso…';

  return (
    <div className="pt-1 space-y-3">
      {!isSubjectMode && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleToggleOpen}
            className="inline-flex items-center gap-2 text-xs font-semibold px-3.5 py-2 rounded-xl border border-secondary bg-muted text-primary hover:bg-secondary/50 transition-colors duration-200 cursor-pointer"
          >
            <span>{isOpen ? 'Ocultar tutor IA' : 'Explícame esta pregunta con IA'}</span>
          </button>

          {isOpen && wasCached && (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
              Explicación instantánea (caché)
            </span>
          )}
        </div>
      )}

      {isOpen && (
        <div className="rounded-xl border border-secondary bg-muted/40 p-4 space-y-3">
          <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
            {messages.length === 0 && !isStreaming && props.mode === 'subject' && (
              <p className="text-sm text-slate-500 italic">
                Escribí tu consulta sobre {props.subjectName} para empezar.
              </p>
            )}

            {messages.map((msg, index) => (
              <div
                key={`${msg.role}-${index}`}
                className={`rounded-xl px-3.5 py-2.5 text-sm ${
                  msg.role === 'user'
                    ? 'bg-primary text-white ml-6'
                    : 'bg-white border border-slate-200 text-slate-800 mr-2 shadow-xs'
                }`}
              >
                {msg.role === 'user' ? (
                  <p>{msg.content}</p>
                ) : (
                  <MarkdownRenderer content={msg.content} />
                )}
              </div>
            ))}

            {isStreaming && (
              <div className="rounded-xl px-3.5 py-2.5 text-sm bg-white border border-secondary text-slate-800 mr-2 shadow-xs">
                {streamingContent ? (
                  <div>
                    <MarkdownRenderer content={streamingContent} />
                    <span className="inline-block w-2 h-4 ml-1 align-middle bg-primary animate-pulse" />
                  </div>
                ) : (
                  <p className="text-slate-500 italic animate-pulse">
                    Pensando explicación paso a paso…
                  </p>
                )}
              </div>
            )}
          </div>

          {error && (
            <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <form onSubmit={handleFollowUpSubmit} className="flex gap-2 pt-1">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={placeholder}
              disabled={isStreaming}
              className="flex-1 min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-secondary disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={isStreaming || inputValue.trim().length === 0}
              className="shrink-0 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors duration-200 cursor-pointer"
            >
              Enviar
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
