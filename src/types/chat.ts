import type { paths } from '../api/schema';

type ChatPost = paths['/api/chat']['post'];

export type ChatRequestBody = ChatPost['requestBody']['content']['application/json'];
export type ChatMessage = ChatRequestBody['messages'][number];
