"""
Homly project package.

Python 3.14 compatibility: Django's BaseContext.__copy__ uses copy(super())
which fails on Python 3.14. We patch it to copy all attributes (template,
autoescape, etc.) like older Django versions did.
"""
import sys
from copy import copy

if sys.version_info >= (3, 14):
    from django.template.context import BaseContext

    def _basecontext_copy(self):
        duplicate = BaseContext()
        duplicate.__class__ = self.__class__
        duplicate.__dict__ = copy(self.__dict__)
        duplicate.dicts = self.dicts[:]
        return duplicate

    BaseContext.__copy__ = _basecontext_copy
