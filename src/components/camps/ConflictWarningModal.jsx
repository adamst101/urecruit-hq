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

const SEVERITY_STYLES = {
  error: "bg-red-900/30 border-red-700/50 text-red-300",
  warning: "bg-amber-900/30 border-amber-700/50 text-amber-300",
  info: "bg-blue-900/30 border-blue-700/50 text-blue-300",
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
          <DialogTitle className="text-[#f9fafb]">Heads Up — Potential Conflict</DialogTitle>
          <DialogDescription className="text-[#9ca3af]">
            Review the warnings below before proceeding.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-60 overflow-y-auto">
          {warnings.map((w, i) => (
            <div
              key={i}
              className={`text-sm rounded-lg border px-3 py-2 ${SEVERITY_STYLES[w.severity] || SEVERITY_STYLES.info}`}
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