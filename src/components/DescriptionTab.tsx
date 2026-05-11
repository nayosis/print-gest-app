import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Project } from "../model";

interface DescriptionTabProps {
  selected: Project;
  onEdit: () => void;
}

export function DescriptionTab({ selected, onEdit }: DescriptionTabProps) {
  return (
    <section className="detail-section">
      <div className="section-header-row">
        <h2>Description (main.md)</h2>
        <button className="btn-edit" onClick={onEdit}>
          {selected.markdown_content ? "✏️ Modifier" : "✏️ Créer"}
        </button>
      </div>
      {selected.markdown_content ? (
        <div className="markdown-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{selected.markdown_content}</ReactMarkdown>
        </div>
      ) : (
        <p className="empty-files">Aucun fichier main.md — clique sur "Créer" pour en rédiger un.</p>
      )}
    </section>
  );
}
