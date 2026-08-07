"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCertDrillExamFormAction, initialExamFormActionState } from "./exam-form-actions";

export function ExamFormCreateDialog({ certificationId }: { certificationId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createCertDrillExamFormAction, initialExamFormActionState);
  useEffect(() => { if (state.status === "error") setOpen(true); }, [state.status]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button>Create Form</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Create Form</DialogTitle><DialogDescription>Generate a complete weighted assignment. New forms stay inactive until activated.</DialogDescription></DialogHeader>
        <form action={action} className="space-y-4">
          <input type="hidden" name="certificationId" value={certificationId} />
          <Field name="name" label="Name" error={state.fieldErrors.name?.[0]} />
          <Field name="durationMinutes" label="Duration in minutes" type="number" defaultValue="120" error={state.fieldErrors.durationMinutes?.[0]} />
          <Field name="targetQuestionCount" label="Target question count" type="number" error={state.fieldErrors.targetQuestionCount?.[0]} />
          {state.formError ? <p role="alert" className="text-sm text-destructive">{state.formError}</p> : null}
          <Button type="submit" disabled={pending}>{pending ? "Creating..." : "Create Form"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ name, label, error, ...props }: React.ComponentProps<typeof Input> & { name: string; label: string; error?: string }) {
  return <div className="space-y-2"><Label htmlFor={`create-form-${name}`}>{label}</Label><Input id={`create-form-${name}`} name={name} min={props.type === "number" ? 1 : undefined} required {...props} />{error ? <p className="text-sm text-destructive">{error}</p> : null}</div>;
}
