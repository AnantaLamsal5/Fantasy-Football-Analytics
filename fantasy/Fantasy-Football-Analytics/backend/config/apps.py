import sys

from django.apps import AppConfig
from django.contrib.admin.apps import AdminConfig
from django.contrib.auth.apps import AuthConfig
from django.contrib.contenttypes.apps import ContentTypesConfig


class MongoAdminConfig(AdminConfig):
    default_auto_field = 'django_mongodb_backend.fields.ObjectIdAutoField'


class MongoAuthConfig(AuthConfig):
    default_auto_field = 'django_mongodb_backend.fields.ObjectIdAutoField'


class MongoContentTypesConfig(ContentTypesConfig):
    default_auto_field = 'django_mongodb_backend.fields.ObjectIdAutoField'


class MongoBootstrapConfig(AppConfig):
    default_auto_field = 'django_mongodb_backend.fields.ObjectIdAutoField'
    name = 'config'

    def ready(self):
        command = sys.argv[1] if len(sys.argv) > 1 else ''
        if command not in {'runserver', 'test', 'testserver'}:
            return

        from .mongo_setup import bootstrap_mongo

        bootstrap_mongo()
