import type { paths } from '../api/schema';

type AttemptsSubmitPost = paths['/api/attempts/submit']['post'];
type AttemptsGet = paths['/api/attempts']['get'];
type AttemptDetailGet = paths['/api/attempts/{id}']['get'];
type WeakPointsGet = paths['/api/stats/weak-points']['get'];
type RecommendationsPost = paths['/api/stats/recommendations']['post'];

export type SubmitAttemptBody = AttemptsSubmitPost['requestBody']['content']['application/json'];
export type SubmitAttemptResponse = AttemptsSubmitPost['responses'][200]['content']['application/json'];
export type AttemptDetailResponse = AttemptDetailGet['responses'][200]['content']['application/json'];
export type AttemptResultData = SubmitAttemptResponse['data'];
export type SubjectScoreBreakdown = AttemptResultData['bySubject'][number];
export type QuestionCorrectionItem = AttemptResultData['results'][number];

export type AttemptHistoryResponse = AttemptsGet['responses'][200]['content']['application/json'];
export type AttemptHistoryItem = AttemptHistoryResponse['data'][number];

export type WeakPointsResponse = WeakPointsGet['responses'][200]['content']['application/json'];
export type WeakPointsData = WeakPointsResponse['data'];
export type WeakTopicItem = WeakPointsData['byTopic'][number];
export type WeakQuestionItem = WeakPointsData['byQuestion'][number];

export type RecommendationsResponse = RecommendationsPost['responses'][200]['content']['application/json'];
export type RecommendationsData = RecommendationsResponse['data'];
