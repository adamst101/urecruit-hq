// src/components/camps/UnregisterConfirmModal.jsx
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

export default function UnregisterConfirmModal({
  open,
  onClose,
  campName,
  onRemove,
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="bg-[#111827] border-[#1f2937] text-[#f9fafb] max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[#f9fafb]">
            Remove registered status for {campName}?
          </DialogTitle>
          <DialogDescription className="text-[#9ca3af]">
            This will remove the registered mark from this camp.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex gap-2 mt-2">
          <Button
            variant="outline"
            onClick={onClose}
            className="border-[#374151] bg-transparent text-[#f9fafb] hover:bg-[#1f2937]"
          >
            Cancel
          </Button>
          <Button
            onClick={onRemove}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}