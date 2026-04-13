import os
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from livekit import api
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

# Cấu hình Static files (HTML/JS)
if not os.path.exists("static"):
    os.makedirs("static")
app.mount("/static", StaticFiles(directory="static"), name="static")

class TokenRequest(BaseModel):
    room_name: str
    participant_name: str

@app.post("/api/token")
async def get_token(req: TokenRequest):
    # Đọc credentials từ .env
    lk_url = os.getenv("LIVEKIT_URL")
    lk_api_key = os.getenv("LIVEKIT_API_KEY")
    lk_api_secret = os.getenv("LIVEKIT_API_SECRET")

    if not lk_api_key or not lk_api_secret:
        raise HTTPException(status_code=500, detail="LiveKit credentials not configured")

    # Tạo AccessToken
    token = api.AccessToken(lk_api_key, lk_api_secret) \
        .with_identity(req.participant_name) \
        .with_name(req.participant_name) \
        .with_grants(api.VideoGrants(
            room_join=True,
            room=req.room_name,
        ))

    return {"token": token.to_jwt()}

@app.get("/")
async def root():
    # Redirect to index.html
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url="/static/index.html")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
