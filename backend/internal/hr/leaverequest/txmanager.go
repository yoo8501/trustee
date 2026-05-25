package leaverequest

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
)

// PgxTxManager — pgxpool 기반 TxManager 구현.
//
// fn 이 nil 반환 시 commit, 에러 반환 또는 panic 시 rollback.
// rollback 자체의 에러는 silently 무시 (원본 fn 에러를 보존).
type PgxTxManager struct {
	pool *pgxpool.Pool
}

// NewPgxTxManager — pgxpool 주입.
func NewPgxTxManager(pool *pgxpool.Pool) *PgxTxManager {
	return &PgxTxManager{pool: pool}
}

// WithTx — pgx.Tx 시작 → *dbq.Queries 로 wrap → fn 호출 → commit/rollback.
func (m *PgxTxManager) WithTx(ctx context.Context, fn func(TxStore) error) error {
	if m.pool == nil {
		return errors.New("leaverequest: pgx pool is nil")
	}
	tx, err := m.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer func() {
		if p := recover(); p != nil {
			_ = tx.Rollback(ctx)
			panic(p)
		}
	}()

	q := dbq.New(tx)
	if err := fn(q); err != nil {
		_ = tx.Rollback(ctx)
		return err
	}
	return tx.Commit(ctx)
}
