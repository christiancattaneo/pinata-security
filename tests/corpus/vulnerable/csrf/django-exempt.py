# CSRF Exemption
# Expected: csrf at lines 6, 12

from django.views.decorators.csrf import csrf_exempt
from django.http import JsonResponse

@csrf_exempt  # Line 6: VULNERABLE
def update_profile(request):
    return JsonResponse({'status': 'ok'})

@csrf_exempt  # Line 12: VULNERABLE
def delete_account(request):
    return JsonResponse({'status': 'deleted'})
