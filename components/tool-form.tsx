"use client";

import { useId, useRef, useState, type FormEvent, type Ref } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { CATEGORIES, CATEGORY_LABELS, CONDITIONS, CONDITION_LABELS } from "@/convex/lib/constants";
import type { ToolCard } from "@/convex/tools";
import { IndexCard, IndexCardHeader } from "@/components/index-card";
import { Button } from "@/components/ui/button";
import { toastError } from "@/lib/errors";
import {
  DESCRIPTION_MAX,
  NAME_MAX,
  NAME_MIN,
  hasErrors,
  validateTool,
  type ToolErrors,
  type ToolInput,
} from "@/lib/tool-form";
import { cn } from "@/lib/utils";

/*
 * The "List a tool" index card (screen D2). One form for both jobs: with no
 * `tool` it lists a new tool, with a `tool` it edits that one. Inline errors
 * come from lib/tool-form (the same limits as convex/tools.ts); Convex still
 * checks everything and its errors surface as toasts.
 */

const EMPTY: ToolInput = { name: "", category: "", condition: "", description: "" };

const FIELD_LABEL = "text-sm font-semibold";
const CONTROL =
  "box-border h-[46px] w-full rounded-md border border-control bg-paper px-3.5 text-base text-ink aria-invalid:border-alert";
const ERROR = "text-[13px] font-semibold text-alert-ink";

function initial(tool?: ToolCard): ToolInput {
  return tool
    ? { name: tool.name, category: tool.category, condition: tool.condition, description: tool.description }
    : EMPTY;
}

export function ToolForm({
  tool,
  onDone,
  nameRef,
}: {
  /** The tool being edited. Omit to list a new one. */
  tool?: ToolCard;
  /** Called after a successful save, and when Cancel is pressed while editing. */
  onDone: () => void;
  nameRef?: Ref<HTMLInputElement>;
}) {
  const uid = useId();
  const id = (part: string) => `${uid}-${part}`;
  const formRef = useRef<HTMLFormElement>(null);
  const submitting = useRef(false);
  const [values, setValues] = useState<ToolInput>(() => initial(tool));
  const [touched, setTouched] = useState<Partial<Record<keyof ToolInput, boolean>>>({});
  const [busy, setBusy] = useState(false);

  const create = useMutation(api.tools.create);
  const update = useMutation(api.tools.update);

  const editing = tool !== undefined;
  const errors: ToolErrors = validateTool(values);
  const shown = (field: keyof ToolInput) => (touched[field] ? errors[field] : undefined);
  const set = (field: keyof ToolInput) => (value: string) => setValues((v) => ({ ...v, [field]: value }));
  const touch = (field: keyof ToolInput) => setTouched((t) => ({ ...t, [field]: true }));

  // The limit is on the trimmed text, as in validateTool and Convex, so the counter counts that.
  const count = values.description.trim().length;
  const overLimit = count > DESCRIPTION_MAX;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    if (hasErrors(errors)) {
      setTouched({ name: true, category: true, condition: true, description: true });
      const first = (["name", "category", "condition", "description"] as const).find((f) => errors[f]);
      formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    submitting.current = true;
    setBusy(true);
    const clean = { ...values, name: values.name.trim(), description: values.description.trim() };
    try {
      if (tool) {
        await update({ toolId: tool._id, ...clean });
        toast.success(`Saved ${clean.name}`);
      } else {
        await create(clean);
        toast.success(`Listed ${clean.name}`, { description: "Neighbors can see it on the board now." });
        setValues(EMPTY);
        setTouched({});
      }
      onDone();
    } catch (error) {
      toastError(error);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  function cancel() {
    setValues(initial(tool));
    setTouched({});
    if (editing) onDone();
  }

  const nameError = shown("name");
  const categoryError = shown("category");
  const conditionError = shown("condition");
  const descriptionError = shown("description");

  return (
    <IndexCard elevation="raised" aria-labelledby={id("title")} className="overflow-hidden">
      <form ref={formRef} noValidate onSubmit={submit} aria-busy={busy}>
        <IndexCardHeader className="px-[22px] pt-[18px] pb-3">
          <p className="font-mono text-xs font-medium tracking-[0.08em] text-ink-muted uppercase">
            {tool ? `${tool.shortCode} · Editing` : "New listing"}
          </p>
          <h2
            id={id("title")}
            className="mt-1.5 font-heading text-[28px] leading-[1.1] font-extrabold tracking-[-0.01em]"
          >
            {tool ? "Edit tool" : "List a tool"}
          </h2>
        </IndexCardHeader>

        <div className="flex flex-col gap-5 px-[22px] pt-5 pb-[22px]">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={id("name")} className={FIELD_LABEL}>
              Name
            </label>
            <input
              ref={nameRef}
              id={id("name")}
              name="name"
              type="text"
              autoComplete="off"
              value={values.name}
              onChange={(e) => set("name")(e.target.value)}
              onBlur={() => touch("name")}
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? id("name-error") : id("name-hint")}
              className={CONTROL}
            />
            {nameError ? (
              <span id={id("name-error")} aria-live="polite" className={ERROR}>
                {nameError}
              </span>
            ) : (
              <span id={id("name-hint")} className="text-[13px] text-ink-muted">
                {NAME_MIN} to {NAME_MAX} characters.
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={id("category")} className={FIELD_LABEL}>
              Category
            </label>
            <select
              id={id("category")}
              name="category"
              value={values.category}
              onChange={(e) => set("category")(e.target.value)}
              onBlur={() => touch("category")}
              aria-invalid={categoryError ? true : undefined}
              aria-describedby={categoryError ? id("category-error") : undefined}
              className={cn(CONTROL, "px-3")}
            >
              <option value="" disabled>
                Choose a category
              </option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
            {categoryError ? (
              <span id={id("category-error")} aria-live="polite" className={ERROR}>
                {categoryError}
              </span>
            ) : null}
          </div>

          <fieldset
            className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0"
            aria-describedby={conditionError ? id("condition-error") : undefined}
          >
            <legend className={cn(FIELD_LABEL, "mb-2 p-0")}>Condition</legend>
            <div className="grid grid-cols-2 gap-2">
              {CONDITIONS.map((c) => (
                <label
                  key={c}
                  className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-md border border-border px-3 text-sm has-checked:border-[1.5px] has-checked:border-violet has-checked:bg-selected-wash has-checked:font-semibold"
                >
                  <input
                    type="radio"
                    name="condition"
                    value={c}
                    checked={values.condition === c}
                    onChange={() => set("condition")(c)}
                    onBlur={() => touch("condition")}
                    className="m-0 size-[18px] accent-violet"
                  />
                  {CONDITION_LABELS[c]}
                </label>
              ))}
            </div>
            {conditionError ? (
              <span id={id("condition-error")} aria-live="polite" className={ERROR}>
                {conditionError}
              </span>
            ) : null}
          </fieldset>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={id("description")} className={FIELD_LABEL}>
              Short description
            </label>
            <textarea
              id={id("description")}
              name="description"
              rows={3}
              value={values.description}
              onChange={(e) => set("description")(e.target.value)}
              onBlur={() => touch("description")}
              aria-invalid={descriptionError ? true : undefined}
              aria-describedby={`${id("count")}${descriptionError ? ` ${id("description-error")}` : ""}`}
              className="box-border w-full resize-y rounded-md border border-control bg-paper px-3.5 py-3 text-[15px] leading-normal text-ink aria-invalid:border-alert"
            />
            <div className="flex items-start justify-between gap-3">
              {descriptionError ? (
                <span id={id("description-error")} aria-live="polite" className={ERROR}>
                  {descriptionError}
                </span>
              ) : (
                <span />
              )}
              <span
                id={id("count")}
                aria-live="polite"
                className={cn("font-mono text-xs", overLimit ? "font-semibold text-alert-ink" : "text-ink-muted")}
              >
                {count} / {DESCRIPTION_MAX}
              </span>
            </div>
          </div>

          <p className="m-0 rounded-md bg-paper-muted px-3.5 py-3 text-[13px] leading-normal text-ink-soft">
            Neighbors see only your first name next to this listing. Your email stays private.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="lg" className="flex-1" disabled={busy}>
              {busy ? "Saving…" : editing ? "Save changes" : "List tool"}
            </Button>
            <Button type="button" variant="outline" size="lg" onClick={cancel} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      </form>
    </IndexCard>
  );
}
