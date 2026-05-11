const TAG_PALETTE = [
  { bg: "#dbeafe", text: "#1e40af" },
  { bg: "#dcfce7", text: "#166534" },
  { bg: "#fef3c7", text: "#92400e" },
  { bg: "#fce7f3", text: "#9d174d" },
  { bg: "#ede9fe", text: "#5b21b6" },
  { bg: "#ffedd5", text: "#9a3412" },
  { bg: "#e0f2fe", text: "#075985" },
  { bg: "#f0fdf4", text: "#14532d" },
];

export function tagColor(tag: string): { bg: string; text: string } {
  let h = 0;
  for (const c of tag) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return TAG_PALETTE[h % TAG_PALETTE.length];
}
