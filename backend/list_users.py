from core.models import User
for u in User.objects.all():
    print(u.email, '| org:', u.organization, '| role:', u.role)
