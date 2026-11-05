#!/bin/sh
# 変更を公開する前に実行: CSS/JS の読み込みに新しい版番号を付けて、ブラウザのキャッシュを確実に更新させる
V=$(date +%Y%m%d%H%M)
sed -i -E "s#href=\"style.css(\?v=[0-9]+)?\"#href=\"style.css?v=$V\"#; s#src=\"(js/[a-z]+\.js)(\?v=[0-9]+)?\"#src=\"\1?v=$V\"#g" index.html
echo "version $V"
