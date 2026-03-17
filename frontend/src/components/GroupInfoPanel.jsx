export default function GroupInfoPanel({
  group,
  currentUserId,
  onClose,
  onRemoveMember,
  onLeaveGroup,
  socketBaseUrl,
}) {
  if (!group) return null;

  const isAdmin = group.admins?.some(
    (a) => (typeof a === "string" ? a : a._id) === currentUserId
  );

  const avatarUrl = (u, size = 40) =>
    u?.profilePicture
      ? `${socketBaseUrl}${u.profilePicture}`
      : `https://placehold.co/${size}x${size}/202c33/aebac1?text=${(u?.username?.[0] || "?").toUpperCase()}`;

  return (
    <aside className="contact-info-panel">
      <div className="contact-info-panel-header">
        <button className="icon-btn" onClick={onClose}>✕</button>
        <span>Group info</span>
      </div>

      <div className="contact-info-panel-body">
        <div className="contact-info-avatar">
          <div className="group-info-avatar-circle">
            <svg viewBox="0 0 24 24" width="60" height="60" fill="#aebac1">
              <path d="M16.5 13c-1.2 0-3.07.34-4.5 1-1.43-.67-3.3-1-4.5-1C5.33 13 1 14.08 1 16.25V19h22v-2.75C23 14.08 18.67 13 16.5 13zM9 12c1.93 0 3.5-1.57 3.5-3.5S10.93 5 9 5 5.5 6.57 5.5 8.5 7.07 12 9 12zm6 0c1.93 0 3.5-1.57 3.5-3.5S16.93 5 15 5s-3.5 1.57-3.5 3.5S13.07 12 15 12z"/>
            </svg>
          </div>
        </div>

        <h3>{group.name}</h3>
        {group.description && <p className="contact-info-status">{group.description}</p>}
        <p className="contact-info-status" style={{ opacity: 0.6 }}>
          Group · {group.members?.length || 0} participants
        </p>

        <div className="contact-info-section">
          <label>Members</label>
          <div className="group-member-list">
            {(group.members || []).map((member) => {
              const memberId = typeof member === "string" ? member : member._id;
              const isAdm = group.admins?.some(
                (a) => (typeof a === "string" ? a : a._id) === memberId
              );
              return (
                <div key={memberId} className="group-member-item">
                  <img src={avatarUrl(member, 36)} alt={member.username} className="group-member-avatar" />
                  <div className="group-member-info">
                    <span className="group-member-name">
                      {member.username}
                      {memberId === currentUserId && " (You)"}
                    </span>
                    {isAdm && <span className="group-admin-badge">Admin</span>}
                  </div>
                  {isAdmin && memberId !== currentUserId && (
                    <button
                      className="group-member-remove"
                      onClick={() => onRemoveMember(memberId)}
                      title="Remove"
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <button className="group-leave-btn" onClick={onLeaveGroup}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="#ea0038">
            <path d="M16 13v-2H7V8l-5 4 5 4v-3z"/>
            <path d="M20 3h-9c-1.103 0-2 .897-2 2v4h2V5h9v14h-9v-4H9v4c0 1.103.897 2 2 2h9c1.103 0 2-.897 2-2V5c0-1.103-.897-2-2-2z"/>
          </svg>
          Exit group
        </button>
      </div>
    </aside>
  );
}
