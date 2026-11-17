import ReactMarkdown, { type Components, type Options } from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';

type MarkdownRendererProps = {
  /** Texto en Markdown. Si viene vacío no renderiza nada. */
  content: string;
  /**
   * `block` para enunciados (puede tener párrafos, listas, fórmulas en bloque).
   * `inline` para textos cortos como las opciones: evita `<p>`/`<div>` dentro
   * de un `<label>`, que rompe la asociación del radio con su texto.
   */
  variant?: 'block' | 'inline';
  className?: string;
};

/**
 * KaTeX con `throwOnError: false`: una fórmula mal escrita se muestra en rojo
 * en vez de tirar el render del examen entero. Un alumno rindiendo no puede
 * quedarse sin pantalla porque una pregunta trae un `$` de más.
 */
const rehypePlugins: NonNullable<Options['rehypePlugins']> = [
  [rehypeKatex, { throwOnError: false, errorColor: '#b91c1c' }],
];

const remarkPlugins: NonNullable<Options['remarkPlugins']> = [remarkMath];

/**
 * En modo inline se reemplaza el párrafo por un `<span>`: react-markdown
 * siempre envuelve el texto en `<p>`, y un `<p>` adentro de un `<label>` es
 * HTML inválido (el navegador lo reordena y el click deja de marcar el radio).
 */
const inlineComponents: Components = {
  p: 'span',
};

/**
 * Renderiza el contenido de las preguntas: Markdown + matemáticas del CUP.
 *
 * No se habilita `rehype-raw`, así que el HTML embebido en el banco se ignora
 * en vez de ejecutarse. Las fórmulas aceptan `$...$` (en línea) y `$$...$$`.
 */
export function MarkdownRenderer({
  content,
  variant = 'block',
  className = '',
}: MarkdownRendererProps) {
  if (content.trim() === '') return null;

  if (variant === 'inline') {
    return (
      <span className={className}>
        <ReactMarkdown
          remarkPlugins={remarkPlugins}
          rehypePlugins={rehypePlugins}
          components={inlineComponents}
          skipHtml
        >
          {content}
        </ReactMarkdown>
      </span>
    );
  }

  return (
    <div className={`markdown-body ${className}`.trim()}>
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} skipHtml>
        {content}
      </ReactMarkdown>
    </div>
  );
}
