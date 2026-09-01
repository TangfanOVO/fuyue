import type { PersonProfile } from "@fuyue/core";

export function ProfileAvatar({ profile, className = "" }: { profile: PersonProfile; className?: string }) {
  const initial = profile.displayName.trim().slice(-1) || (profile.id === "user" ? "我" : "伴");
  return <span className={`profile-avatar ${className}`} aria-label={`${profile.displayName}的头像`}>
    {profile.avatarDataUrl ? <img src={profile.avatarDataUrl} alt="" /> : <b>{initial}</b>}
  </span>;
}

