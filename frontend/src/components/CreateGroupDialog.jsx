import { useState } from "react";

export default function CreateGroupDialog({ friends, onClose, onCreate }) {
  const [name, setName] = useState("");
  const [selected, setSelected] = useState(new Set());

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim() || selected.size === 0) return;
    onCreate({ name: name.trim(), memberIds: [...selected] });
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="create-group-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="create-group-header">
          <h3>New Group</h3>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="create-group-name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Group name"
              maxLength={50}
              autoFocus
            />
          </div>

          <div className="create-group-members">
            <p className="create-group-label">Add participants</p>
            {(!friends || friends.length === 0) && (
              <p className="create-group-empty">No friends to add</p>
            )}
            <div className="create-group-list">
              {(friends || []).map((f) => (
                <div
                  key={f._id}
                  className={`create-group-member ${selected.has(f._id) ? "selected" : ""}`}
                  onClick={() => toggle(f._id)}
                >
                  <div className="create-group-check">
                    {selected.has(f._id) ? (
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="#00a884">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                      </svg>
                    ) : (
                      <div className="create-group-uncheck" />
                    )}
                  </div>
                  <span>{f.username}</span>
                </div>
              ))}
            </div>
          </div>

          {selected.size > 0 && (
            <div className="create-group-selected-tags">
              {[...selected].map((id) => {
                const f = friends.find((fr) => fr._id === id);
                return f ? (
                  <span key={id} className="create-group-tag">
                    {f.username}
                    <button type="button" onClick={() => toggle(id)}>✕</button>
                  </span>
                ) : null;
              })}
            </div>
          )}

          <button
            type="submit"
            className="create-group-submit"
            disabled={!name.trim() || selected.size === 0}
          >
            Create Group
          </button>
        </form>
      </div>
    </div>
  );
}
