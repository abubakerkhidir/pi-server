import { useState, useRef, useEffect, useCallback } from "react";
import type { MsgData } from "@/frontend/types";
import { marked } from "marked";

export default function TextBlock({ entity }: {entity:MsgData}) {
  const parsed = marked.parse(entity.content) || "";
  return (
     <div className="markdown" key={`msg-${entity.id}`} dangerouslySetInnerHTML={{ __html: parsed as string }} />
  );
}
