"""Text embedding utilities."""

from __future__ import annotations

from dataclasses import dataclass

# BGE retrieval models perform best when the *query* (the thing being searched
# with) carries a task-specific instruction prefix.  Passages (job descriptions)
# do NOT get this prefix.  See: https://huggingface.co/BAAI/bge-small-en-v1.5
_BGE_QUERY_PREFIX = "Represent this resume for job search: "


@dataclass(frozen=True)
class EmbedderConfig:
    # BAAI/bge-small-en-v1.5 is a retrieval-optimised model:
    #   • 512 token limit  (vs 256 for all-MiniLM-L6-v2)
    #   • same 384 dimensions  → no DB schema change needed
    #   • asymmetric query/passage design  → better for job matching
    model_name: str = "BAAI/bge-small-en-v1.5"
    batch_size: int = 32


class Embedder:
    """SentenceTransformers-based embedder.

    Kept behind a small wrapper so the rest of the codebase doesn't depend on
    sentence-transformers directly.

    Usage pattern:
        embedder.embed_text(job_text)   # passage side  – job descriptions
        embedder.embed_query(resume)    # query side    – resume / candidate
    """

    def __init__(self, config: EmbedderConfig | None = None) -> None:
        self.config = config or EmbedderConfig()
        # Import lazily so the base crawler can run without embedding deps installed.
        from sentence_transformers import SentenceTransformer  # type: ignore

        self._model = SentenceTransformer(self.config.model_name)

    @property
    def model_name(self) -> str:
        return self.config.model_name

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        """Embed a list of passage texts (job descriptions).  No prefix added."""
        vectors = self._model.encode(
            texts,
            batch_size=self.config.batch_size,
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        return [v.tolist() for v in vectors]

    def embed_text(self, text: str) -> list[float]:
        """Embed a single passage text (job description side)."""
        return self.embed_texts([text])[0]

    def embed_query(self, text: str) -> list[float]:
        """Embed a query text (resume / candidate side) with the BGE task prefix.

        BGE models are trained with an asymmetric setup: the query gets a short
        instruction prefix while passages do not.  Using this method for resumes
        and ``embed_text`` for job descriptions gives the best retrieval quality.
        """
        is_bge = "bge" in self.config.model_name.lower()
        query = (_BGE_QUERY_PREFIX + text) if is_bge else text
        return self.embed_texts([query])[0]

