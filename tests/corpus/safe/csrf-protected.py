# Safe: CSRF protection enabled
# Expected: NO detections

from django.http import JsonResponse
from django.views.decorators.http import require_POST

@require_POST  # Safe: no csrf_exempt
def update_profile(request):
    return JsonResponse({'status': 'ok'})

def delete_account(request):
    # CSRF token checked by middleware
    return JsonResponse({'status': 'deleted'})
