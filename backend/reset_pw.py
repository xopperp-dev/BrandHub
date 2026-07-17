from core.models import User
u = User.objects.get(email='admin@gmail.com')
u.set_password('admin123')
u.save()
print('Password reset for', u.email)
