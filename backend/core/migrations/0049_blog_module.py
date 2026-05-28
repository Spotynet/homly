import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0048_unit_credit_balance_evidence'),
    ]

    operations = [
        migrations.CreateModel(
            name='BlogPost',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('title', models.CharField(max_length=300)),
                ('excerpt', models.CharField(blank=True, default='', max_length=500)),
                ('content', models.TextField(blank=True, default='')),
                ('cover_gradient', models.CharField(default='from-teal-400 to-cyan-500', max_length=120)),
                ('cover_emoji', models.CharField(default='📰', max_length=10)),
                ('cover_image', models.ImageField(blank=True, null=True, upload_to='blog/covers/')),
                ('status', models.CharField(
                    choices=[('draft', 'Borrador'), ('published', 'Publicado'), ('editing', 'En Edición')],
                    db_index=True, default='draft', max_length=20,
                )),
                ('category', models.CharField(
                    blank=True, db_index=True, default='',
                    choices=[
                        ('aviso', 'Aviso'),
                        ('mantenimiento', 'Mantenimiento'),
                        ('evento', 'Evento'),
                        ('reglamento', 'Reglamento'),
                        ('logro', 'Noticia / Logro'),
                    ],
                    max_length=30,
                )),
                ('tags', models.JSONField(blank=True, default=list)),
                ('audience_type', models.CharField(
                    choices=[('all', 'Todos los miembros'), ('roles', 'Por Rol'), ('specific', 'Usuarios Específicos')],
                    default='all', max_length=20,
                )),
                ('audience_roles', models.JSONField(
                    blank=True, default=list,
                    help_text='Role keys included when audience_type == "roles"',
                )),
                ('audience_user_ids', models.JSONField(
                    blank=True, default=list,
                    help_text='User UUIDs (str) included when audience_type == "specific"',
                )),
                ('views_count', models.PositiveIntegerField(default=0)),
                ('published_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('tenant', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='blog_posts',
                    to='core.tenant',
                )),
                ('author', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='blog_posts',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'db_table': 'blog_posts',
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='blogpost',
            index=models.Index(fields=['tenant', 'status'], name='blog_posts_tenant_status_idx'),
        ),
        migrations.AddIndex(
            model_name='blogpost',
            index=models.Index(fields=['tenant', 'category'], name='blog_posts_tenant_category_idx'),
        ),
        migrations.CreateModel(
            name='BlogReaction',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('reaction', models.CharField(
                    choices=[('like', '👍'), ('love', '❤️'), ('clap', '👏'), ('idea', '💡')],
                    max_length=10,
                )),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('post', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='reactions',
                    to='core.blogpost',
                )),
                ('user', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='blog_reactions',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'db_table': 'blog_reactions',
                'unique_together': {('post', 'user', 'reaction')},
            },
        ),
        migrations.CreateModel(
            name='BlogComment',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('content', models.TextField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('post', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='comments',
                    to='core.blogpost',
                )),
                ('author', models.ForeignKey(
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='blog_comments',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'db_table': 'blog_comments',
                'ordering': ['created_at'],
            },
        ),
    ]
