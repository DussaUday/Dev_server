from fastapi import FastAPI
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer

app = FastAPI()

model = SentenceTransformer("all-MiniLM-L6-v2")

class TextRequest(BaseModel):
    texts: list

@app.post("/embed")
async def embed_text(req: TextRequest):
    embeddings = model.encode(req.texts, convert_to_numpy=True).tolist()
    return {"embeddings": embeddings}
