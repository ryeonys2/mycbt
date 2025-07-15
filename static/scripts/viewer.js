const url = decodeURIComponent(document.body.dataset.pdfUrl);
const bookName = decodeURIComponent(document.body.dataset.bookName);
const pageRange = document.body.dataset.pageRange;
const pdfjsLib = window['pdfjs-dist/build/pdf'];
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.13.216/pdf.worker.min.js';

let pdfDoc = null, currentPage = 1, step = 0, setCounter = 1;
const stepText = ["📌 문제 영역을 선택하세요", "📌 선지 영역을 선택하세요", "📌 해설 영역을 선택하세요"];
let pendingImages = {};  // 문제, 선지, 해설 이미지 저장용

let allowedPages = null;
if (pageRange) {
    allowedPages = new Set();
    pageRange.split(",").forEach(part => {
        if (part.includes("-")) {
            const [start, end] = part.split("-").map(Number);
            for (let i = start; i <= end; i++) allowedPages.add(i);
        } else {
            allowedPages.add(Number(part));
        }
    });
}

pdfjsLib.getDocument(url).promise.then(function(pdfDoc_) {
    pdfDoc = pdfDoc_;
    renderThumbnails();
    renderPage(currentPage);
    setMemoDefault();
}).catch(function(error) {
    console.error("❌ PDF 로드 실패:", error);
    alert("❌ PDF 파일을 불러올 수 없습니다. 경로를 확인하세요.");
});

function renderThumbnails() {
    const thumbnails = document.getElementById('thumbnails');
    for (let i = 1; i <= pdfDoc.numPages; i++) {
        if (allowedPages && !allowedPages.has(i)) continue;
        pdfDoc.getPage(i).then(function(page) {
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            const viewport = page.getViewport({scale: 0.3});
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            page.render({canvasContext: context, viewport: viewport});
            canvas.addEventListener('click', () => {
                currentPage = i;
                renderPage(i);
            });
            thumbnails.appendChild(canvas);
        });
    }
}

function renderPage(num) {
    pdfDoc.getPage(num).then(function(page) {
        const canvas = document.getElementById('pdfCanvas');
        const context = canvas.getContext('2d');
        const viewport = page.getViewport({scale: 2.0});
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        page.render({canvasContext: context, viewport: viewport}).promise.then(() => {
            registerCaptureEvents(canvas);
        });
    });
}

function registerCaptureEvents(pdfCanvas) {
    const selection = document.getElementById('selection');
    const instruction = document.getElementById('instruction');
    let startX, startY, endX, endY, isSelecting = false;

    pdfCanvas.onmousedown = (e) => {
        const rect = pdfCanvas.getBoundingClientRect();
        const scaleX = pdfCanvas.width / rect.width;
        const scaleY = pdfCanvas.height / rect.height;
        startX = (e.clientX - rect.left) * scaleX;
        startY = (e.clientY - rect.top) * scaleY;
        selection.style.left = `${e.clientX - rect.left}px`;
        selection.style.top = `${e.clientY - rect.top}px`;
        selection.style.width = `0px`;
        selection.style.height = `0px`;
        selection.style.display = 'block';
        isSelecting = true;
    };

    pdfCanvas.onmousemove = (e) => {
        if (!isSelecting) return;
        const rect = pdfCanvas.getBoundingClientRect();
        const currentX = e.clientX - rect.left;
        const currentY = e.clientY - rect.top;
        const width = currentX - parseFloat(selection.style.left);
        const height = currentY - parseFloat(selection.style.top);
        selection.style.width = `${Math.abs(width)}px`;
        selection.style.height = `${Math.abs(height)}px`;
    };

    pdfCanvas.onmouseup = (e) => {
        isSelecting = false;
        const rect = pdfCanvas.getBoundingClientRect();
        const scaleX = pdfCanvas.width / rect.width;
        const scaleY = pdfCanvas.height / rect.height;
        endX = (e.clientX - rect.left) * scaleX;
        endY = (e.clientY - rect.top) * scaleY;

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        const sx = Math.min(startX, endX);
        const sy = Math.min(startY, endY);
        const sw = Math.abs(endX - startX);
        const sh = Math.abs(endY - startY);

        if (sw < 10 || sh < 10) {
            alert("❌ 선택한 영역이 너무 작습니다.");
            selection.style.display = 'none';
            return;
        }

        canvas.width = sw;
        canvas.height = sh;
        context.drawImage(pdfCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
        const captured = canvas.toDataURL('image/png');

        if (step === 0) pendingImages.problem = captured;
        if (step === 1) pendingImages.choice = captured;
        if (step === 2) pendingImages.explanation = captured;

        if (step < 2) {
            step++;
            instruction.textContent = stepText[step];
        } else {
            instruction.textContent = "✅ 모든 캡처가 완료되었습니다. 정답을 선택 후 저장하세요.";
        }

        selection.style.display = 'none';
    };
}

function setMemoDefault() {
    const memoInput = document.getElementById('memo');
    if (!memoInput.value.trim()) {
        memoInput.value = `${setCounter}번 문제`;
    }
}

function showFinalPreview() {
    const answer = document.querySelector('input[name="answer"]:checked');
    const memo = document.getElementById('memo').value.trim();
    if (!answer) return alert("❌ 정답을 선택하세요.");
    if (!pendingImages.problem || !pendingImages.choice || !pendingImages.explanation)
        return alert("❌ 모든 영역을 캡처하세요.");

    document.getElementById('finalProblemPreview').src = pendingImages.problem;
    document.getElementById('finalChoicePreview').src = pendingImages.choice;
    document.getElementById('finalExplanationPreview').src = pendingImages.explanation;
    document.getElementById('finalAnswerPreview').textContent = answer.value;
    document.getElementById('finalMemoPreview').textContent = memo || "(메모 없음)";
    document.getElementById('finalPreviewModal').style.display = 'block';
}

function confirmFinalSave() {
    const form = document.getElementById("saveForm");
    document.getElementById('problemImg').value = pendingImages.problem;
    document.getElementById('choiceImg').value = pendingImages.choice;
    document.getElementById('explanationImg').value = pendingImages.explanation;

    fetch(`/save_capture?book_name=${encodeURIComponent(bookName)}`, {
        method: "POST",
        body: new FormData(form)
    }).then(res => res.text()).then(data => {
        alert("✅ 세트 저장 완료! 다음 문제 캡처를 시작하세요.");
        step = 0;
        pendingImages = {};
        form.reset();
        setCounter++;
        setMemoDefault();
        document.getElementById('instruction').textContent = stepText[0];
        document.getElementById('finalPreviewModal').style.display = 'none';
    });
}

function cancelFinalPreview() {
    document.getElementById('finalPreviewModal').style.display = 'none';
}
