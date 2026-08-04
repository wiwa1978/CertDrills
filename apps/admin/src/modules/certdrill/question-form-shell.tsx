"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import {
  initialQuestionFormActionState,
  type QuestionFormActionState,
} from "./question-form-state";
import { questionFieldId } from "./question-form-navigation";

type QuestionFormAction = (
  previousState: QuestionFormActionState,
  formData: FormData,
) => Promise<QuestionFormActionState>;

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "Saving..." : label}</Button>;
}

type QuestionFormChildren = ReactNode | ((state: QuestionFormActionState) => ReactNode);

export function QuestionFormShell({
  action,
  submitLabel,
  idPrefix,
  children,
  onFieldErrorLink,
}: {
  action: QuestionFormAction;
  submitLabel: string;
  idPrefix: string;
  children: QuestionFormChildren;
  onFieldErrorLink?: (fieldName: string) => void;
}) {
  const [state, formAction] = useActionState(action, initialQuestionFormActionState);
  const fieldErrors = Object.entries(state.fieldErrors);

  return (
    <form id={`${idPrefix}-form`} action={formAction} className="space-y-4" noValidate>
      {state.status === "error" ? (
        <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm">
          <p className="font-semibold">Question could not be saved.</p>
          {state.formError ? <p className="mt-1">{state.formError}</p> : null}
          {fieldErrors.length > 0 ? (
            <>
              <p className="mt-1">Please correct the following:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {fieldErrors.flatMap(([fieldName, messages]) => messages.map((message) => {
                  const fieldId = questionFieldId(idPrefix, fieldName);
                  return (
                    <li key={`${fieldName}-${message}`}>
                      <a
                        className="underline underline-offset-2"
                        href={`#${fieldId}`}
                        onClick={(event) => {
                          if (!onFieldErrorLink) return;
                          event.preventDefault();
                          onFieldErrorLink(fieldName);
                        }}
                      >
                        {message}
                      </a>
                    </li>
                  );
                }))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
      {state.status === "success" && state.message ? (
        <div role="status" className="rounded-md border border-green-600/40 bg-green-600/10 p-4 text-sm">
          {state.message}
        </div>
      ) : null}
      {typeof children === "function" ? children(state) : children}
      <SubmitButton label={submitLabel} />
    </form>
  );
}
