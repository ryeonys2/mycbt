from flask import Flask, render_template, request, jsonify, send_file, send_from_directory
import os, json, base64
from werkzeug.utils import secure_filename

app = Flask(__name__)

UPLOAD_FOLDER = os.path.join("static", "uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

PROBLEM_SETS_FOLDER = "problem_sets"
os.makedirs(PROBLEM_SETS_FOLDER, exist_ok=True)

@app.route("/", methods=["GET", "POST"])
def upload_pdf():
    if request.method == "POST":
        book_name = request.form.get("book_name")
        page_range = request.form.get("page_range", "")

        # PDF 저장
        pdf_file = request.files["pdf"]
        filename = secure_filename(pdf_file.filename)
        pdf_path = os.path.join(UPLOAD_FOLDER, filename)
        pdf_file.save(pdf_path)

        return render_template(
            "viewer.html",
            pdf_file=filename,
            page_range=page_range,
            book_name=book_name
        )

    book_list = get_existing_books()
    return render_template("upload.html", book_list=book_list)

@app.route("/test_books")
def test_books():
    books = get_existing_books()
    return render_template("test_books.html", books=books)

@app.route("/test/<book_name>")
def start_test(book_name):
    book_folder = os.path.join(PROBLEM_SETS_FOLDER, book_name)
    sets = sorted(os.listdir(book_folder))
    questions = []
    for s in sets:
        set_folder = os.path.join(book_folder, s)
        if not os.path.isdir(set_folder):
            continue
        info_file = os.path.join(set_folder, "info.json")
        if os.path.exists(info_file):
            with open(info_file, "r", encoding="utf-8") as f:
                info = json.load(f)
            questions.append({
                "problem": f"{book_name}/{s}/problem.png",
                "choice": f"{book_name}/{s}/choice.png",
                "explanation": f"{book_name}/{s}/explanation.png",
                "answer": info["answer"],
                "memo": info.get("memo", "")
            })
    return render_template("test.html", book_name=book_name, questions=questions)

@app.route("/test_result", methods=["POST"])
def test_result():
    data = request.json
    total = len(data["questions"])
    correct = sum(1 for q in data["questions"] if str(q["user_answer"]) == str(q["answer"]))
    wrong = total - correct
    score = int(correct / total * 100)
    return render_template(
        "test_result.html",
        result={
            "score": score,
            "correct": correct,
            "wrong": wrong,
            "total": total,
            "questions": data["questions"]
        }
    )

def get_existing_books():
    return sorted([
        name for name in os.listdir(PROBLEM_SETS_FOLDER)
        if os.path.isdir(os.path.join(PROBLEM_SETS_FOLDER, name))
    ])

@app.route('/problem_sets/<path:filename>')
def serve_problem_image(filename):
    return send_from_directory(PROBLEM_SETS_FOLDER, filename)

if __name__ == "__main__":
    app.run(debug=True)
