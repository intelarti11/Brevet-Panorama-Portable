"use client";

import type { ChangeEvent, DragEvent, ReactNode } from "react";
import { useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface ImportFileDropzoneProps {
  id: string;
  accept: string;
  prompt: ReactNode;
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
  multiple?: boolean;
  children?: ReactNode;
  className?: string;
}

/** Shared accessible file input and drag-and-drop surface for dashboard imports. */
export function ImportFileDropzone({
  id,
  accept,
  prompt,
  onFilesSelected,
  disabled = false,
  multiple = false,
  children,
  className,
}: ImportFileDropzoneProps) {
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragCounter = useRef(0);

  function selectFiles(files: FileList | null) {
    if (disabled || !files?.length) return;
    onFilesSelected(Array.from(files));
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    selectFiles(event.currentTarget.files);
    event.currentTarget.value = "";
  }

  function handleDragEnter(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (disabled || !event.dataTransfer.types.includes("Files")) return;
    dragCounter.current += 1;
    setIsDraggingOver(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) setIsDraggingOver(false);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = disabled ? "none" : "copy";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    dragCounter.current = 0;
    setIsDraggingOver(false);
    if (!disabled) selectFiles(event.dataTransfer.files);
  }

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={cn(
        "relative flex w-full flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-primary/70",
        isDraggingOver ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50",
        className,
      )}
    >
      <UploadCloud className={cn("mb-4 h-10 w-10", isDraggingOver ? "text-primary" : "text-muted-foreground")} aria-hidden="true" />
      <Label htmlFor={id} className="text-center text-sm font-medium">
        {prompt}
      </Label>
      <Input
        id={id}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={handleChange}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />
      {children}
    </div>
  );
}
