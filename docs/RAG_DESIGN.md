# RAG_DESIGN.md

Design only — do not implement until the corpus is provenance-cleared.

## Goal
A retrieval-augmented generation layer for Yorùbá content: dictionaries,
proverb sets, grammar references, cultural and historical context.

## Requirements before any corpus enters
1. Every source must be recorded in docs/CONTENT_PROVENANCE.md with its
   author or owner, licence or permission, date obtained, how it is used
   and an approver.
2. No scraped or unlicensed corpus may enter the repo, the eval set or the
   retrieval index.
3. Unknown provenance means the item is quarantined.

## Components (design only)
- Corpus: provenance-cleared Yorùbá texts.
- Index: embeddings stored in Firestore or a separate vector store.
- Retrieval: top-k chunks prepended to the system prompt as context.
- Guard: retrieval results are never user-controlled; they are injected
  only as assistant-context text.

## Open questions
- Which embedding model? VERIFY vendor terms before choosing.
- Where does the index live? Firestore or a dedicated vector store?
- How is the corpus refreshed? Manual upload with provenance review.