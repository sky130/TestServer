const express = require('express');
const fs = require('fs');
const util = require('util')
const multer = require('multer');
const path = require('path');
const AppInfoParser = require('app-info-parser');
const { log } = require('console');
const sqlite3 = require('sqlite3').verbose();
const app = express();
const db = new sqlite3.Database('database/app.db');
const upload = multer({
    dest: 'uploads/',
    fileFilter: (req, file, cb) => {
        const extname = path.extname(file.originalname);
        if (extname !== '.apk') {
            return cb(new Error('只允许上传 APK 文件！'));
        }
        cb(null, true);
    }
});
db.run("create table if not exists app_list (id INTEGER PRIMARY KEY,name text NOT NULL, package_name text NOT NULL UNIQUE,author text NOT NULL, version text NOT NULL, version_code integer NOT NULL)")

function addApp(name, package_name, author, version, version_code) {
    db.serialize(() => {
        db.run("INSERT INTO app_list (name, package_name, author, version, version_code) VALUES (?, ?, ?, ?, ?)",
            [name, package_name, author, version, version_code],
            function (err) {
                if (err) {
                    console.error(err.message);
                }
            }
        );
    });
}

function addApp(name, package_name, author, version, version_code) {
    db.serialize(() => {
        db.run("REPLACE INTO app_list (name, package_name, author, version, version_code) VALUES (?, ?, ?, ?, ?)",
            [name, package_name, author, version, version_code],
            function (err) {
                if (err) {
                    console.error(err.message);
                }
            }
        );
    });
}

function checkDataExists(package_name) {
    const sql = `SELECT COUNT(*) AS count FROM app_list where package_name = '${package_name}'`;
    db.get(sql, (err, row) => {
        if (err) {
            return false
        } else {
            const count = row.count;
            return count > 0;
        }
    });
    return false
}

app.get('/apk/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = `${__dirname}/apk/${filename}`; // 文件路径

    // 检查文件是否存在
    fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) {
            res.status(404).send('File not found');
            return;
        }

        // 设置响应头
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
        res.setHeader('Content-Type', 'application/octet-stream');

        // 创建可读流并将文件内容写入响应
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
    });
});

app.get('/api/list', (req, res) => {
    db.all('SELECT name, package_name, author, version, version_code FROM app_list', (err, rows) => {
        if (err) {
            console.error(err);
        } else {
            const jsonData = JSON.stringify(rows);
            res.send(jsonData)
        }
    });
});

app.get('/api/search', (req, res) => {
    const keyword = req.query.name; // 获取参数值
    const query = `SELECT name, package_name, author, version, version_code FROM app_list WHERE name LIKE '%${keyword}%'`;
    db.all(query, (err, rows) => {
        if (err) {
            res.send('nope');
        } else {
            const jsonData = JSON.stringify(rows);
            res.send(jsonData);
        }
    });
});

app.get('/api/url', (req, res) => {
    const package_name = req.query.package_name;
    const version_code = req.query.version_code;
    const domain = req.headers.host;
    res.send(`${domain}/apk/${package_name}_${version_code}.apk`);
});

app.post('/api/upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.send('未选择文件！');
    }
    const author = req.body.author;
    const originalName = req.file.originalname;
    const filename = req.file.filename;
    const filePath = req.file.path;
    const newPath = `${filePath}.apk`;
    fs.rename(filePath, newPath, async (err) => {
        try {
            const parser = new AppInfoParser(newPath);
            const manifest = await parser.parse();
            const label = manifest.application.label
            const packageName = manifest.package;
            const versionName = manifest.versionName
            const versionCode = manifest.versionCode;
            const targetDirectory = path.join(__dirname, 'apk');
            const targetFilename = `${packageName}_${versionCode}.apk`;
            const targetPath = path.join(targetDirectory, targetFilename);
            try {
                addApp(label.toString(), packageName, author, versionName, versionCode);
            } catch (error) {
                replaceApp(label.toString(), packageName, author, versionName, versionCode);
            }
            fs.rename(newPath, targetPath, (err) => {
                if (err) {
                    fs.unlink(newPath, (err) => {
                        if (err) {
                            console.error('删除缓存文件错误:', err);
                        }
                    });
                    if (!fs.existsSync(targetPath)) {
                        return res.send('文件保存失败！');
                    }
                }
                res.send(`应用名称: ${label}\n文件上传并保存成功！`);
            });
        } catch (error) {
            console.error('解析 APK 文件错误:', error);
            res.send('解析 APK 文件错误！');
        }
    });
});

app.get('/upload/', (req, res) => {
    res.sendFile(__dirname + '/upload.html');
});

app.listen(1145, () => {
    console.log('Server is running on port 3000');
});