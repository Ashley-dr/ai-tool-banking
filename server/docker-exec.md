# 1. Download Llama 3.2 3B (Your conversational text writer)

docker exec -it bank_ollama ollama pull llama3.2:3b
docker exec -it bank_ollama ollama run mistral

# 2. Download Nomic Embed (Your document analyzer mapping engine)

docker exec -it bank_ollama ollama pull nomic-embed-text
pip install pandas openpyxl pypdf requests python-docx pillow pytesseract pdf2image

curl.exe -X POST -F "doc=@C:\" http://localhost:3000/api/ingest
