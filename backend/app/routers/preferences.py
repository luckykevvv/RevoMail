from fastapi import APIRouter, Depends, Request

from backend.app.dependencies import require_csrf, require_session
from backend.app.errors import AppError
from backend.app.preferences import PreferencesPatch

router = APIRouter()


@router.get("")
def read_preferences(request: Request, session=Depends(require_session)):
    repository = request.app.state.preferences
    return {"settings": repository.get(session.user["id"]), "allowedAiModels": repository.models}


@router.patch("")
def update_preferences(payload: PreferencesPatch, request: Request, session=Depends(require_csrf)):
    patch = payload.model_dump(exclude_unset=True)
    if not patch or any(value is None for value in patch.values()):
        raise AppError("INVALID_SETTINGS", "Supply valid preference values.", 422)
    try:
        values = request.app.state.preferences.update(session.user["id"], patch)
    except ValueError:
        raise AppError("INVALID_SETTINGS", "The selected preference is not supported.", 422) from None
    return {"settings": values, "allowedAiModels": request.app.state.preferences.models}
