"use client";
import { useEffect, useState } from "react";
import MarkdownIt from "markdown-it";
import { diffWords } from "diff";


interface ConfirmChangesProps {
    args: any;
    respond: any;
    status: any;
    onReject: () => void;
    onConfirm: () => void;
    editor: any;
    currentDocument: string;
    setCurrentDocument: (document: string) => void;
}

export function ConfirmChanges({ args, respond, status, onReject, onConfirm, editor, currentDocument, setCurrentDocument }: ConfirmChangesProps) {
    function fromMarkdown(text: string) {
        const md = new MarkdownIt({
            typographer: true,
            html: true,
        });

        return md.render(text);
    }
    function diffPartialText(
        oldText: string,
        newText: string,
        isComplete: boolean = false
    ) {
        let oldTextToCompare = oldText;
        if (oldText.length > newText.length && !isComplete) {
            // make oldText shorter
            oldTextToCompare = oldText.slice(0, newText.length);
        }

        const changes = diffWords(oldTextToCompare, newText);

        let result = "";
        changes.forEach((part) => {
            if (part.added) {
                result += `<em>${part.value}</em>`;
            } else if (part.removed) {
                result += `<s>${part.value}</s>`;
            } else {
                result += part.value;
            }
        });

        if (oldText.length > newText.length && !isComplete) {
            result += oldText.slice(newText.length);
        }

        return result;
    }

    useEffect(() => {
        console.log(args?.document, "statusstatusstatusstatus");
        if (currentDocument == "") {
            editor?.commands.setContent(fromMarkdown(args?.document || ""));
        }
        else {
            let diff = diffPartialText(currentDocument, args?.document || "");
            editor?.commands.setContent(fromMarkdown(diff));
        }
    }, [args?.document])

    const [accepted, setAccepted] = useState<boolean | null>(null);
    if (status != 'inProgress') {
        return (
            <div className="bg-white p-6 rounded shadow-lg border border-gray-200 mt-5 mb-5">
                <h2 className="text-lg font-bold mb-4">Confirm Changes</h2>
                <p className="mb-6">Do you want to accept the changes?</p>
                {accepted === null && (
                    <div className="flex justify-end space-x-4">
                        <button
                            className={`bg-gray-200 text-black py-2 px-4 rounded disabled:opacity-50 ${status === "executing" ? "cursor-pointer" : "cursor-default"
                                }`}
                            disabled={status !== "executing"}
                            onClick={() => {
                                debugger
                                if (respond) {
                                    setCurrentDocument(currentDocument);
                                    setAccepted(false);
                                    onReject();
                                    respond("Changes rejected");
                                }
                            }}
                        >
                            Reject
                        </button>
                        <button
                            className={`bg-black text-white py-2 px-4 rounded disabled:opacity-50 ${status === "executing" ? "cursor-pointer" : "cursor-default"
                                }`}
                            disabled={status !== "executing"}
                            onClick={() => {
                                debugger
                                if (respond) {
                                    setCurrentDocument(args?.document || "");
                                    setAccepted(true);
                                    onConfirm();
                                    respond("Changes accepted");
                                }
                            }}
                        >
                            Confirm
                        </button>
                    </div>
                )}
                {accepted !== null && (
                    <div className="flex justify-end">
                        <div className="mt-4 bg-gray-200 text-black py-2 px-4 rounded inline-block">
                            {accepted ? "✓ Accepted" : "✗ Rejected"}
                        </div>
                    </div>
                )}
            </div>
        );
    }
    else {
        return null;
    }
}