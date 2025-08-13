<?php
// Allow only GET requests
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    exit('Method Not Allowed');
}

// Check for 'csid' parameter
if (!isset($_GET['csid']) || trim($_GET['csid']) === '') {
    http_response_code(400);
    exit('Missing "csid" parameter');
}

$csid = trim($_GET['csid']);
$playlistUrl = 'https://raw.githubusercontent.com/luongz/iptv-jp/main/jp_clean.m3u';

// Fetch the playlist content
$playlist = @file_get_contents($playlistUrl);

if ($playlist === false) {
    http_response_code(500);
    exit('Failed to fetch playlist');
}

// Search for the matching URL
$lines = explode("\n", $playlist);
$foundUrl = null;

foreach ($lines as $line) {
    $line = trim($line);
    if ($line && strpos($line, $csid) !== false) {
        $foundUrl = $line;
        break;
    }
}

// Return result
if ($foundUrl) {
    header('Content-Type: text/plain');
    echo $foundUrl;
} else {
    http_response_code(404);
    exit('URL not found');
}
