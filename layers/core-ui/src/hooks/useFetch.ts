// Shared fetch-state shape for hooks that manage their own fetch effect
// (e.g. useTaskSessions). The `useFetch` hook that used to be built on top
// of it is deleted — BC4 moved its last production consumers
// (KnowledgeList, useKnowledgeItem) onto `useDocuments`/`useDocument`
// (`call("search_documents"|"open_document", …)`), and nothing else called it.

export interface FetchState<T> {
	data: T | null;
	error: string | null;
	isLoading: boolean;
}
