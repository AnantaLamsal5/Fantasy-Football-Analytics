from __future__ import annotations

import os
import sys
from threading import Lock

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from pymongo import ASCENDING
from pymongo.errors import CollectionInvalid, PyMongoError, ServerSelectionTimeoutError


_BOOTSTRAP_LOCK = Lock()
_BOOTSTRAPPED = False


def _mongo_uri() -> str:
    return getattr(settings, 'MONGO_URI', None) or os.environ.get(
        'MONGO_URI',
        os.environ.get('MONGODB_URI', 'mongodb://127.0.0.1:27017'),
    )


def _mongo_db_name() -> str:
    return getattr(settings, 'MONGO_DB_NAME', None) or os.environ.get(
        'MONGO_DB_NAME',
        'fantasyfootball_db',
    )


def _should_bootstrap() -> bool:
    if os.environ.get('MONGO_SKIP_AUTO_SETUP', '').strip().lower() in {'1', 'true', 'yes', 'on'}:
        return False
    command = sys.argv[1] if len(sys.argv) > 1 else ''
    return command in {'runserver', 'test', 'testserver'}


def _ensure_collection(database, collection_name: str) -> None:
    if collection_name not in database.list_collection_names():
        try:
            database.create_collection(collection_name)
        except CollectionInvalid:
            pass


def _ensure_indexes(collection, index_specs) -> None:
    for index_fields, index_kwargs in index_specs:
        try:
            collection.create_index(index_fields, **index_kwargs)
        except Exception:
            pass


def bootstrap_mongo() -> None:
    global _BOOTSTRAPPED

    if _BOOTSTRAPPED or not _should_bootstrap():
        return

    with _BOOTSTRAP_LOCK:
        if _BOOTSTRAPPED:
            return

        try:
            from pymongo import MongoClient

            client = MongoClient(_mongo_uri(), serverSelectionTimeoutMS=5000)
            client.admin.command('ping')
            database = client[_mongo_db_name()]

            collection_specs = {
                'Users': [
                    ([('email', ASCENDING)], {'name': 'users_email_idx'}),
                ],
                'Players': [
                    ([('name', ASCENDING)], {'name': 'players_name_idx'}),
                ],
                'UserTeams': [
                    ([('user_id', ASCENDING)], {'name': 'userteams_user_id_idx'}),
                ],
                'TransferRecords': [
                    ([('user_id', ASCENDING)], {'name': 'transferrecords_user_id_idx'}),
                ],
                'AdminMatches': [
                    ([('kickoff', ASCENDING)], {'name': 'adminmatches_kickoff_idx'}),
                    ([('matchday', ASCENDING)], {'name': 'adminmatches_matchday_idx'}),
                ],
                'Admin': [
                    ([('email', ASCENDING)], {'name': 'admin_email_idx', 'unique': True}),
                ],
                'leaderboard': [
                    ([('userId', ASCENDING)], {'name': 'leaderboard_userId_idx'}),
                ],
                'notifications': [
                    ([('userId', ASCENDING)], {'name': 'notifications_userId_idx'}),
                ],
                'profiles': [
                    ([('userId', ASCENDING)], {'name': 'profiles_userId_idx'}),
                ],
            }

            for collection_name, index_specs in collection_specs.items():
                _ensure_collection(database, collection_name)
                _ensure_indexes(database[collection_name], index_specs)

            _BOOTSTRAPPED = True
        except ServerSelectionTimeoutError as exc:
            raise ImproperlyConfigured(
                f'MongoDB is not available at {_mongo_uri()}. Start MongoDB before running the server.'
            ) from exc
        except PyMongoError as exc:
            raise ImproperlyConfigured(f'Unable to initialize MongoDB database {_mongo_db_name()}: {exc}') from exc
