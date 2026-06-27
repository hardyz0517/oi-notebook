use std::{io::Write, net::TcpStream};

pub(crate) fn write_response(stream: &mut TcpStream, status: u16, reason: &str, body: &str) {
    let body = body.as_bytes();
    let response = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );

    if let Err(e) = stream.write_all(response.as_bytes()) {
        eprintln!("Failed to write local blog response headers: {e}");
        return;
    }

    if let Err(e) = stream.write_all(body) {
        eprintln!("Failed to write local blog response body: {e}");
    }
}

pub(crate) fn write_json_response(stream: &mut TcpStream, status: u16, reason: &str, body: &str) {
    let body = body.as_bytes();
    let response = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );

    if let Err(e) = stream.write_all(response.as_bytes()) {
        eprintln!("Failed to write local blog JSON response headers: {e}");
        return;
    }

    if let Err(e) = stream.write_all(body) {
        eprintln!("Failed to write local blog JSON response body: {e}");
    }
}

pub(crate) fn write_redirect_response(stream: &mut TcpStream, location: &str) {
    let response = format!(
        "HTTP/1.1 308 Permanent Redirect\r\nLocation: {location}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
    );

    if let Err(e) = stream.write_all(response.as_bytes()) {
        eprintln!("Failed to write local blog redirect response: {e}");
    }
}

pub(crate) fn write_binary_response(
    stream: &mut TcpStream,
    status: u16,
    reason: &str,
    content_type: &str,
    body: &[u8],
) {
    let response = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );

    if let Err(e) = stream.write_all(response.as_bytes()) {
        eprintln!("Failed to write local blog binary response headers: {e}");
        return;
    }

    if let Err(e) = stream.write_all(body) {
        eprintln!("Failed to write local blog binary response body: {e}");
    }
}
