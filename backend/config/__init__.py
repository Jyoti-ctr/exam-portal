"""
Initialize PyMySQL as the MySQLdb driver for Django and configure
compatibility for MySQL 8.0.
"""
import pymysql
from django.db.backends.mysql.features import DatabaseFeatures

pymysql.install_as_MySQLdb()

# Django 6 defaults minimum MySQL version to 8.4 LTS.
# Enable full compatibility with MySQL 8.0.x:
DatabaseFeatures.minimum_database_version = property(
    lambda self: (10, 11) if self.connection.mysql_is_mariadb else (8, 0)
)
