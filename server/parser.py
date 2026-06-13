# parser.py

import os
if "SSLKEYLOGFILE" in os.environ:
    del os.environ["SSLKEYLOGFILE"]
import sys
import json
import requests
import pypdf
from docx import Document
from PIL import Image
import pytesseract
import openpyxl
import pdf2image
import pandas as pd


pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

OLLAMA_URL = "http://localhost:11434/api/embeddings"

def extract_text_from_pdf(file_path):
    reader = pypdf.PdfReader(file_path)
    text = ""
    for page in reader.pages:
        text += page.extract_text() or ""
    
    if len(text.strip()) < 300 or len(text.split()) < 15:
        print(" Complex/Structural PDF layout detected. Running visual OCR engine...", file=sys.stderr)
        try:
            # Convert PDF pages to visual images in system memory
            images = pdf2image.convert_from_path(file_path)
            ocr_text = ""
            for img in images:
                # Let Tesseract visually read the fields out of the boxes!
                ocr_text += pytesseract.image_to_string(img) + "\n"
            return ocr_text
        except Exception as ocr_err:
            print(f" PDF OCR conversion failed (Make sure Poppler is installed): {ocr_err}", file=sys.stderr)
            
    return text

def extract_text_from_docx(file_path):
    doc = Document(file_path)
    text = []
    for paragraph in doc.paragraphs:
        if paragraph.text.strip():
            text.append(paragraph.text)
    return "\n".join(text)

def extract_text_from_image(file_path):
    img = Image.open(file_path)
    return pytesseract.image_to_string(img)

def extract_text_from_tabular(file_path, is_csv=False):
    text_lines = []
    
    if is_csv:
        # Process CSV using Pandas to keep column alignments absolute
        df = pd.read_csv(file_path, header=None, dtype=str)
        df = df.fillna("")
        for _, row in df.iterrows():
            row_vals = [str(val).strip() for val in row if str(val).strip()]
            if row_vals:
                text_lines.append(" | ".join(row_vals))
    else:
        # Process Multi-Sheet Excel files using Pandas DataFrames
        excel_file = pd.ExcelFile(file_path)
        for sheet_name in excel_file.sheet_names:
            text_lines.append(f"--- Sheet: {sheet_name} ---")
            df = pd.read_excel(file_path, sheet_name=sheet_name, header=None, dtype=str)
            
            # Forward-fill and backward-fill across columns.
            # This mirrors data across merged cells so labels like "SSS No." stay locked with their rows!
            df = df.ffill(axis=1).bfill(axis=1).fillna("")
            
            for _, row in df.iterrows():
                row_vals = [str(val).strip() for val in row]
                # Only keep rows that aren't purely empty grid slots
                if any(val != "" for val in row_vals):
                    text_lines.append(" | ".join(row_vals))
                    
    return "\n".join(text_lines)

def parse_document(file_path):
    try:
        file_path = file_path.strip().strip('"').strip("'")
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Target file path not found: {file_path}")

        ext = os.path.splitext(file_path)[1].lower()
        raw_text = ""

        if ext == '.pdf':
            raw_text = extract_text_from_pdf(file_path)
        elif ext in ['.docx', '.doc']:
            raw_text = extract_text_from_docx(file_path)
        elif ext in ['.png', '.jpg', '.jpeg', '.tiff', '.bmp']:
            raw_text = extract_text_from_image(file_path)
        elif ext in ['.xlsx', '.xls']: 
            raw_text = extract_text_from_tabular(file_path, is_csv=False)
        elif ext == '.csv':
            raw_text = extract_text_from_tabular(file_path, is_csv=True)
        elif ext in ['.txt', '.json']:
            with open(file_path, 'r', encoding='utf-8') as f:
                raw_text = f.read()
        else:
            raise ValueError(f"Unsupported file format extension: '{ext}' on calculated path: '{file_path}'")

        
        chunk_size = 1000     
        chunk_overlap = 250  
        chunks = []
        
        i = 0
        while i < len(raw_text):
            chunk = raw_text[i:i + chunk_size]
            if chunk.strip():
                chunks.append(chunk)
            i += (chunk_size - chunk_overlap)
        
        payload_data = []
        for chunk in chunks:
            # Request semantic vector maps from the local Ollama container
            res = requests.post(OLLAMA_URL, json={
                "model": "nomic-embed-text",
                "prompt": chunk
            })
            
            if res.status_code != 200:
                raise Exception(f"Ollama connection error code: {res.status_code}")
                
            embedding = res.json().get("embedding")
            
            payload_data.append({
                "content": chunk,
                "embedding": embedding
            })

        sys.stdout.reconfigure(encoding='utf-8')
        print(json.dumps({"success": True, "data": payload_data}, ensure_ascii=False))
        
    except Exception as e:
        sys.stdout.reconfigure(encoding='utf-8')
        print(json.dumps({"success": False, "error": str(e)}, ensure_ascii=False))

if __name__ == "__main__":
    sys.stdout.reconfigure(encoding='utf-8')
    if len(sys.argv) > 1:
        parse_document(sys.argv[1])