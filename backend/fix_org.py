from core.models import User, Organization
org, _ = Organization.objects.get_or_create(name='DelemonTechCorp')
u = User.objects.get(email='YOUR_LOGIN_EMAIL')
u.organization = org
u.save()
print(u.email, '->', u.organization)
