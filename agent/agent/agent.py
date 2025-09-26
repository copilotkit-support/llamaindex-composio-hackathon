from typing import Annotated, List, Optional, Dict, Any
import os
from dotenv import load_dotenv

from llama_index.core.workflow import Context
from llama_index.llms.openai import OpenAI
from llama_index.protocols.ag_ui.events import StateSnapshotWorkflowEvent
from llama_index.protocols.ag_ui.router import get_ag_ui_workflow_router
from agent.prompts import SYSTEM_PROMPT
# Load environment variables early to support local development via .env
load_dotenv()


def _load_composio_tools() -> List[Any]:
    """Dynamically load Composio tools for LlamaIndex if configured.

    Reads the following environment variables:
    - COMPOSIO_API_KEY: required by Composio client; read implicitly by SDK
    - COMPOSIO_USER_ID: user/entity id to scope tools (defaults to "default")
    - COMPOSIO_TOOL_IDS: comma-separated list of tool slugs to enable (takes precedence)
    - COMPOSIO_TOOLKITS: comma-separated toolkit slugs to auto-discover from (default: "reddit")
    - COMPOSIO_TOOL_SEARCH: optional keyword to filter tools during discovery
    - COMPOSIO_TOOL_SCOPES: optional comma-separated scopes to filter toolkit tools
    - COMPOSIO_TOOL_LIMIT: optional integer limit for auto-discovery (default: 100)

    Behavior:
    - If COMPOSIO_TOOL_IDS is provided, use those exact tool slugs.
    - Otherwise, auto-discover tools from the specified toolkits (defaults to Reddit).

    Returns an empty list if not configured or if dependencies are missing.
    """
    # Import lazily to avoid hard runtime dependency if not used
    try:
        from composio import Composio  # type: ignore
        from composio_llamaindex import LlamaIndexProvider  # type: ignore
    except Exception:
        return []

    user_id = os.getenv("COMPOSIO_USER_ID", "default")

    # 1) Explicit tool IDs (highest priority)
    tool_ids_str = os.getenv("COMPOSIO_TOOL_IDS", "").strip()
    if tool_ids_str:
        tool_ids = [t.strip() for t in tool_ids_str.split(",") if t.strip()]
        if not tool_ids:
            return []
        try:
            composio = Composio(provider=LlamaIndexProvider())
            tools = composio.tools.get(user_id=user_id, tools=tool_ids)
            return list(tools) if tools is not None else []
        except Exception:
            return []

    # 2) Auto-discover from toolkits (defaults to reddit)
    toolkits_str = os.getenv("COMPOSIO_TOOLKITS", "reddit").strip()
    toolkits = [t.strip() for t in toolkits_str.split(",") if t.strip()]
    search = os.getenv("COMPOSIO_TOOL_SEARCH", "").strip() or None
    scopes_str = os.getenv("COMPOSIO_TOOL_SCOPES", "").strip()
    scopes = [s.strip() for s in scopes_str.split(",") if s.strip()] or None
    try:
        limit = int(os.getenv("COMPOSIO_TOOL_LIMIT", "100").strip())
    except Exception:
        limit = 100

    if not toolkits:
        return []

    try:
        composio = Composio(provider=LlamaIndexProvider())
        tools = composio.tools.get(
            user_id=user_id,
            toolkits=toolkits,
            search=search,
            scopes=scopes,
            limit=limit,
        )
        return list(tools) if tools is not None else []
    except Exception:
        return []


# --- Backend tools (server-side) ---


# --- Frontend tool stubs (names/signatures only; execution happens in the UI) ---

def selectAngle(
    angles: Annotated[List[str], "A list of angles from which user can select"],
) -> str:
    """Select an angle for the story."""
    return f"selectAngle({angles})"

def generateStoryAndConfirm(
    story: Annotated[str, "The story that is generated. Strictly markdown format."],
    title: Annotated[str, "The title of the story"],
    description: Annotated[str, "The description of the story"],
) -> str:
    """Generate a story and confirm it."""
    return f"generateStoryAndConfirm({story}, {title}, {description})"


def createItem(
    type: Annotated[str, "One of: project, entity, note, chart."],
    name: Annotated[Optional[str], "Optional item name."] = None,
) -> str:
    """Create a new canvas item and return its id."""
    return f"createItem({type}, {name})"

def deleteItem(
    itemId: Annotated[str, "Target item id."],
) -> str:
    """Delete an item by id."""
    return f"deleteItem({itemId})"

def setItemName(
    name: Annotated[str, "New item name/title."],
    itemId: Annotated[str, "Target item id."],
) -> str:
    """Set an item's name."""
    return f"setItemName(name, {itemId})"

def setItemSubtitleOrDescription(
    subtitle: Annotated[str, "Item subtitle/short description."],
    itemId: Annotated[str, "Target item id."],
) -> str:
    """Set an item's subtitle/description (not data fields)."""
    return f"setItemSubtitleOrDescription({subtitle}, {itemId})"

def setGlobalTitle(title: Annotated[str, "New global title."]) -> str:
    """Set the global canvas title."""
    return f"setGlobalTitle({title})"

def setGlobalDescription(description: Annotated[str, "New global description."]) -> str:
    """Set the global canvas description."""
    return f"setGlobalDescription({description})"

# Note actions
def setNoteField1(
    value: Annotated[str, "New content for note.data.field1."],
    itemId: Annotated[str, "Target note id."],
) -> str:
    return f"setNoteField1({value}, {itemId})"

def appendNoteField1(
    value: Annotated[str, "Text to append to note.data.field1."],
    itemId: Annotated[str, "Target note id."],
    withNewline: Annotated[Optional[bool], "Prefix with newline if true." ] = None,
) -> str:
    return f"appendNoteField1({value}, {itemId}, {withNewline})"

def clearNoteField1(
    itemId: Annotated[str, "Target note id."],
) -> str:
    return f"clearNoteField1({itemId})"

# Project actions
def setProjectField1(value: Annotated[str, "New value for project.data.field1."], itemId: Annotated[str, "Project id."]) -> str:
    return f"setProjectField1({value}, {itemId})"

def setProjectField2(value: Annotated[str, "New value for project.data.field2."], itemId: Annotated[str, "Project id."]) -> str:
    return f"setProjectField2({value}, {itemId})"

def setProjectField3(date: Annotated[str, "Date YYYY-MM-DD for project.data.field3."], itemId: Annotated[str, "Project id."]) -> str:
    return f"setProjectField3({date}, {itemId})"

def clearProjectField3(itemId: Annotated[str, "Project id."]) -> str:
    return f"clearProjectField3({itemId})"

def addProjectChecklistItem(
    itemId: Annotated[str, "Project id."],
    text: Annotated[Optional[str], "Checklist text."] = None,
) -> str:
    return f"addProjectChecklistItem({itemId}, {text})"

def setProjectChecklistItem(
    itemId: Annotated[str, "Project id."],
    checklistItemId: Annotated[str, "Checklist item id or index."],
    text: Annotated[Optional[str], "New text."] = None,
    done: Annotated[Optional[bool], "New done status."] = None,
) -> str:
    return f"setProjectChecklistItem({itemId}, {checklistItemId}, {text}, {done})"

def removeProjectChecklistItem(
    itemId: Annotated[str, "Project id."],
    checklistItemId: Annotated[str, "Checklist item id."],
) -> str:
    return f"removeProjectChecklistItem({itemId}, {checklistItemId})"

# Entity actions
def setEntityField1(value: Annotated[str, "New value for entity.data.field1."], itemId: Annotated[str, "Entity id."]) -> str:
    return f"setEntityField1({value}, {itemId})"

def setEntityField2(value: Annotated[str, "New value for entity.data.field2."], itemId: Annotated[str, "Entity id."]) -> str:
    return f"setEntityField2({value}, {itemId})"

def addEntityField3(tag: Annotated[str, "Tag to add."], itemId: Annotated[str, "Entity id."]) -> str:
    return f"addEntityField3({tag}, {itemId})"

def removeEntityField3(tag: Annotated[str, "Tag to remove."], itemId: Annotated[str, "Entity id."]) -> str:
    return f"removeEntityField3({tag}, {itemId})"

# Chart actions
def addChartField1(
    itemId: Annotated[str, "Chart id."],
    label: Annotated[Optional[str], "Metric label."] = None,
    value: Annotated[Optional[float], "Metric value 0..100."] = None,
) -> str:
    return f"addChartField1({itemId}, {label}, {value})"

def setChartField1Label(itemId: Annotated[str, "Chart id."], index: Annotated[int, "Metric index (0-based)."], label: Annotated[str, "New metric label."]) -> str:
    return f"setChartField1Label({itemId}, {index}, {label})"

def setChartField1Value(itemId: Annotated[str, "Chart id."], index: Annotated[int, "Metric index (0-based)."], value: Annotated[float, "Value 0..100."]) -> str:
    return f"setChartField1Value({itemId}, {index}, {value})"

def clearChartField1Value(itemId: Annotated[str, "Chart id."], index: Annotated[int, "Metric index (0-based)."]) -> str:
    return f"clearChartField1Value({itemId}, {index})"

def removeChartField1(itemId: Annotated[str, "Chart id."], index: Annotated[int, "Metric index (0-based)."]) -> str:
    return f"removeChartField1({itemId}, {index})"



_backend_tools = _load_composio_tools()

agentic_chat_router = get_ag_ui_workflow_router(
    llm=OpenAI(model="gpt-4.1"),
    # Provide frontend tool stubs so the model knows their names/signatures.
    frontend_tools=[
        selectAngle,
        generateStoryAndConfirm,
    ],
    backend_tools=_backend_tools,
    system_prompt=SYSTEM_PROMPT,
    initial_state={
        # Shared state synchronized with the frontend canvas
        "story": "",
        "title": "",
        "description": "",
    },
)
