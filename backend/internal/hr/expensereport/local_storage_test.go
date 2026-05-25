package expensereport_test

import (
	"bytes"
	"io"
	"os"
	"path/filepath"
	"testing"

	"github.com/sjseo/docflow/backend/internal/hr/expensereport"
)

func TestLocalAttachmentStorage_SaveAndOpen(t *testing.T) {
	dir := t.TempDir()
	s := expensereport.NewLocalAttachmentStorage(dir)
	data := []byte("hello-pdf")

	stored, err := s.Save(42, "receipt.pdf", bytes.NewReader(data))
	if err != nil {
		t.Fatalf("save err=%v", err)
	}
	if stored == "" {
		t.Fatal("stored path empty")
	}
	// 파일이 실제로 디스크에 있는지 확인.
	abs := filepath.Join(dir, stored)
	if _, err := os.Stat(abs); err != nil {
		t.Fatalf("stat %s err=%v", abs, err)
	}

	rc, size, err := s.Open(stored)
	if err != nil {
		t.Fatalf("open err=%v", err)
	}
	defer rc.Close()
	if size != int64(len(data)) {
		t.Errorf("size=%d want %d", size, len(data))
	}
	body, _ := io.ReadAll(rc)
	if string(body) != string(data) {
		t.Errorf("body=%q want %q", string(body), string(data))
	}
}

func TestLocalAttachmentStorage_Save_SanitizesFilename(t *testing.T) {
	dir := t.TempDir()
	s := expensereport.NewLocalAttachmentStorage(dir)
	stored, err := s.Save(1, "../../../etc/passwd", bytes.NewReader([]byte("x")))
	if err != nil {
		t.Fatalf("save err=%v", err)
	}
	// stored path 는 baseDir 밖으로 escape 하면 안 됨.
	abs := filepath.Join(dir, stored)
	absBase, _ := filepath.Abs(dir)
	absFull, _ := filepath.Abs(abs)
	if len(absFull) < len(absBase) || absFull[:len(absBase)] != absBase {
		t.Errorf("escaped base dir: full=%s base=%s", absFull, absBase)
	}
}

func TestLocalAttachmentStorage_Open_NotFound(t *testing.T) {
	dir := t.TempDir()
	s := expensereport.NewLocalAttachmentStorage(dir)
	_, _, err := s.Open("expense/9999/missing.pdf")
	if err != expensereport.ErrNoAttachment {
		t.Errorf("err=%v want ErrNoAttachment", err)
	}
}

func TestLocalAttachmentStorage_Open_PathTraversalBlocked(t *testing.T) {
	dir := t.TempDir()
	// baseDir 밖에 secret 파일 생성.
	parent := filepath.Dir(dir)
	secret := filepath.Join(parent, "secret.txt")
	_ = os.WriteFile(secret, []byte("SECRET"), 0o644)
	defer os.Remove(secret)

	s := expensereport.NewLocalAttachmentStorage(dir)
	_, _, err := s.Open("../secret.txt")
	if err == nil {
		t.Fatal("expected error for path traversal")
	}
}

func TestNewLocalAttachmentStorage_DefaultDir(t *testing.T) {
	s := expensereport.NewLocalAttachmentStorage("")
	if s.BaseDir == "" {
		t.Error("BaseDir should default")
	}
}

// TxManager: PgxTxManager nil pool → 에러.
func TestPgxTxManager_NilPool(t *testing.T) {
	m := expensereport.NewPgxTxManager(nil)
	err := m.WithTx(t.Context(), func(_ expensereport.TxStore) error { return nil })
	if err == nil {
		t.Fatal("expected error for nil pool")
	}
}
