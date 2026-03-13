# Generated migration for EmailVerificationCode model

import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0016_condominio_request'),
    ]

    operations = [
        migrations.CreateModel(
            name='EmailVerificationCode',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('email', models.EmailField(db_index=True, max_length=254)),
                ('code', models.CharField(db_index=True, max_length=8)),
                ('used', models.BooleanField(db_index=True, default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('expires_at', models.DateTimeField(db_index=True)),
            ],
            options={
                'db_table': 'email_verification_codes',
                'ordering': ['-created_at'],
            },
        ),
    ]
