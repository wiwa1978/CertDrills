"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialExamFormActionState } from "./exam-form-action-error";
import { createCertDrillExamFormAction } from "./exam-form-actions";

export function ExamFormCreateDialog({ certificationId }: { certificationId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createCertDrillExamFormAction, initialExamFormActionState);
  const fieldErrors = Object.entries(state.fieldErrors);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button>Create Form</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Create Form</DialogTitle><DialogDescription>Generate a complete weighted assignment. New forms stay inactive until activated.</DialogDescription></DialogHeader>
        <form action={action} className="space-y-4" noValidate>
          <input type="hidden" name="certificationId" value={certificationId} />
          {state.status === "error" ? (
            <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm">
              <p className="font-semibold">Exam form could not be created.</p>
              {state.formError ? <p className="mt-1">{state.formError}</p> : null}
              {fieldErrors.length > 0 ? (
                <>
                  <p className="mt-1">Please correct the following:</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {fieldErrors.flatMap(([fieldName, messages]) => messages.map((message) => (
                      <li key={`${fieldName}-${message}`}>
                        <a className="underline underline-offset-2" href={`#create-form-${fieldName}`}>{message}</a>
                      </li>
                    )))}
                  </ul>
                </>
              ) : null}
            </div>
          ) : null}
          <Field name="name" label="Name" error={state.fieldErrors.name?.[0]} />
          <Field name="durationMinutes" label="Duration in minutes" type="number" defaultValue="120" error={state.fieldErrors.durationMinutes?.[0]} />
          <Field name="targetQuestionCount" label="Target question count" type="number" error={state.fieldErrors.targetQuestionCount?.[0]} />
          <Button type="submit" disabled={pending}>{pending ? "Creating..." : "Create Form"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ name, label, error, ...props }: React.ComponentProps<typeof Input> & { name: string; label: string; error?: string }) {
  const id = `create-form-${name}`;
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><Input id={id} name={name} min={props.type === "number" ? 1 : undefined} aria-invalid={Boolean(error) || undefined} aria-describedby={error ? `${id}-error` : undefined} {...props} />{error ? <p id={`${id}-error`} className="text-sm text-destructive">{error}</p> : null}</div>;
}
