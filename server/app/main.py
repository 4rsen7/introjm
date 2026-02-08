from fastapi import FastAPI

# Важливо: змінна має називатись 'app', бо в команді запуску вказано 'app.main:app'
app = FastAPI()

@app.get("/")
def read_root():
    return {"message": "Hello World"}
