// src/components/camps/ConflictWarningModal.jsx
import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";

const BORDER_COLOR = {
  error:   "border-l-red-500",
  warning: "border-l-amber-500",
  info:    "border-l-[#6b7280]",
};

export default function ConflictWarningModal({
  open,
  onClose,
  warnings,
  onConfirm,
  confirmLabel = "Favorite Anyway",
  cancelLabel = "Cancel",
}) {
  if (!Array.isArray(warnings) || warnings.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="bg-[#111827] border-[#1f2937] text-[#f9fafb] max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[#f9fafb]">Heads Up</DialogTitle>
          <DialogDescription className="text-[#9ca3af]">
            Review before adding to your calendar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-60 overflow-y-auto">
          {warnings.map((w, i) => (
            <div
              key={i}
              className={`text-sm border-l-2 pl-3 py-1 ${BORDER_COLOR[w.severity] || BORDER_COLOR.info}`}
              style={{ color: "#d1d5db" }}
            >
              {w.message}
            </div>
          ))}
        </div>

        <DialogFooter className="flex gap-2 mt-2">
          <Button
            variant="outline"
            onClick={onClose}
            className="border-[#374151] bg-transparent text-[#f9fafb] hover:bg-[#1f2937]"
          >
            {cancelLabel}
          </Button>
          <Button
            onClick={onConfirm}
            className="bg-[#e8a020] text-[#0a0e1a] hover:bg-[#f3b13f]"
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
