document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("note-input");
  const addBtn = document.getElementById("add-btn");
  const notesList = document.getElementById("notes-list");
  const emptyState = document.getElementById("empty-state");

  let notes = [];

  function loadNotes() {
    chrome.storage.local.get({ notes: [] }, (result) => {
      notes = result.notes;
      render();
    });
  }

  function saveNotes(callback) {
    chrome.storage.local.set({ notes }, callback);
  }

  function formatTimestamp(ts) {
    const d = new Date(ts);
    const month = d.toLocaleString("default", { month: "short" });
    const day = d.getDate();
    const year = d.getFullYear();
    const hours = d.getHours().toString().padStart(2, "0");
    const minutes = d.getMinutes().toString().padStart(2, "0");
    return `${month} ${day}, ${year} at ${hours}:${minutes}`;
  }

  function render() {
    notesList.innerHTML = "";

    if (notes.length === 0) {
      emptyState.classList.remove("hidden");
      return;
    }

    emptyState.classList.add("hidden");

    notes.forEach((note) => {
      const card = document.createElement("div");
      card.className = "note-card";

      const text = document.createElement("div");
      text.className = "note-text";
      text.textContent = note.text;

      const meta = document.createElement("div");
      meta.className = "note-meta";

      const timestamp = document.createElement("span");
      timestamp.className = "note-timestamp";
      timestamp.textContent = formatTimestamp(note.timestamp);

      const actions = document.createElement("div");
      actions.className = "note-actions";

      const copyBtn = document.createElement("button");
      copyBtn.className = "btn-copy";
      copyBtn.textContent = "Copy";
      copyBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(note.text).then(() => {
          copyBtn.textContent = "Copied!";
          setTimeout(() => {
            copyBtn.textContent = "Copy";
          }, 1200);
        });
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "btn-delete";
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", () => {
        notes = notes.filter((n) => n.id !== note.id);
        saveNotes(() => render());
      });

      actions.appendChild(copyBtn);
      actions.appendChild(deleteBtn);
      meta.appendChild(timestamp);
      meta.appendChild(actions);
      card.appendChild(text);
      card.appendChild(meta);
      notesList.appendChild(card);
    });
  }

  function addNote() {
    const text = input.value.trim();
    if (!text) return;

    const note = {
      id: Date.now().toString(),
      text,
      timestamp: Date.now(),
    };

    notes.unshift(note);
    saveNotes(() => {
      input.value = "";
      render();
      input.focus();
    });
  }

  addBtn.addEventListener("click", addNote);

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addNote();
  });

  loadNotes();
});
