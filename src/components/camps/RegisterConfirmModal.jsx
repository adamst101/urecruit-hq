// src/components/camps/RegisterConfirmModal.jsx
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

export default function RegisterConfirmModal({
  open,
  onClose,
  campName,
  isPaid,
  linkUrl,
  onMarkRegistered,
  onGoToLink,
  onSubscribe,
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="bg-[#111827] border-[#1f2937] text-[#f9fafb] max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[#f9fafb]">
            {isPaid ? `Mark as Registered at ${campName}?` : "Mark as Registered?"}
          </DialogTitle>
          <DialogDescription className="text-[#9ca3af]">
            {isPaid
              ? "This records that you've registered for this camp. It does not complete your actual registration — use the Register link to pay on Ryzer."
              : "This saves your registration in demo mode. To track real registrations, subscribe."}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex flex-col sm:flex-row gap-2 mt-2">
          <Button
            onClick={onMarkRegistered}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {isPaid ? "Yes, Mark Registered" : "Mark Registered"}
          </Button>

          {isPaid && linkUrl ? (
            <Button
              onClick={onGoToLink}
              className="bg-[#e8a020] text-[#0a0e1a] hover:bg-[#f3b13f]"
            >
              Go to Ryzer →
            </Button>
          ) : !isPaid ? (
            <Button
              onClick={onSubscribe}
              variant="outline"
              className="border-[#374151] bg-transparent text-[#f9fafb] hover:bg-[#1f2937]"
            >
              Subscribe Instead
            </Button>
          ) : null}

          <Button
            variant="outline"
            onClick={onClose}
            className="border-[#374151] bg-transparent text-[#f9fafb] hover:bg-[#1f2937]"
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}