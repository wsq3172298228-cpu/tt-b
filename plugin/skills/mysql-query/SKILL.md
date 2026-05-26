---
name: mysql-query
description: MySQL数据库查询工具 - 自动连接数据库、查询表结构和数据。当用户提到数据库、SQL、MySQL、查询表、表结构、表数据时使用。
---

# MySQL Query Skill

当用户提到数据库、SQL、MySQL、查询表、表结构、表数据时，自动使用此skill连接并查询数据库。

## 安装

确保已安装依赖：

```bash
pip install pymysql
```

## 配置

用户需要提供数据库连接信息。配置文件位置：`~/mysql_config.json`

```json
{
  "host": "localhost",
  "port": 3306,
  "user": "root",
  "password": "your_password",
  "database": "your_database"
}
```

## 使用方式

### Python代码调用

使用 `/Users/m9570/Desktop/vibecoding/mysql_skill/mysql_connector.py` 中的工具：

```python
import sys
sys.path.insert(0, '/Users/m9570/Desktop/vibecoding/mysql_skill')
from mysql_connector import MySQLConnector, explore_database, query_database

# 配置
config = {
    "host": "localhost",
    "port": 3306,
    "user": "root",
    "password": "password",
    "database": "mydb"
}

# 探索数据库结构
result = explore_database(config)

# 执行SQL查询
result = query_database(config, "SELECT * FROM users LIMIT 10")
```

### 命令行调用

```bash
# 列出所有表
python /Users/m9570/Desktop/vibecoding/mysql_skill/cli.py --user root --password pwd --database mydb tables

# 查看表结构
python /Users/m9570/Desktop/vibecoding/mysql_skill/cli.py --user root --password pwd --database mydb structure users

# 查询数据
python /Users/m9570/Desktop/vibecoding/mysql_skill/cli.py --user root --password pwd --database mydb data users --limit 10

# 执行SQL
python /Users/m9570/Desktop/vibecoding/mysql_skill/cli.py --user root --password pwd --database mydb sql "SELECT * FROM users"

# 探索数据库
python /Users/m9570/Desktop/vibecoding/mysql_skill/cli.py --user root --password pwd --database mydb explore
```

## 功能

1. **连接数据库** - 使用配置的用户名、密码、端口、数据库名连接
2. **查询表列表** - 获取数据库中所有表
3. **查看表结构** - 获取表的字段定义
4. **查询表数据** - 获取表中的数据记录
5. **执行SQL** - 执行自定义SQL查询

## 触发条件

当用户消息包含以下关键词时自动触发：
- 数据库
- mysql
- sql
- 查询表
- 表结构
- 表数据
- 数据库连接
- 查数据

## 示例对话

**用户**: 查看users表的结构

**Claude**: 使用mysql-query skill连接数据库并查询表结构：
```python
config = {...}  # 从用户获取或从配置文件读取
result = connector.get_table_structure("users")
```

**用户**: 查询orders表的前10条数据

**Claude**: 执行查询：
```python
result = connector.get_table_data("orders", limit=10)
```
