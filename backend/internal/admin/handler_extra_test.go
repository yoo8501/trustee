package admin_test

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"

	"github.com/sjseo/docflow/backend/internal/admin"
	dbq "github.com/sjseo/docflow/backend/internal/db/sqlc"
	"github.com/sjseo/docflow/backend/internal/httpx/apiresult"
	"github.com/sjseo/docflow/backend/internal/httpx/errorcode"
	"github.com/sjseo/docflow/backend/internal/permission"
)

// 내부 에러 (service 가 NotFound 도 CannotTerminateSelf 도 아닌 에러 반환) → 500.

type updateFailHandlerStore struct {
	*fakeAdminStore
}

func (s *updateFailHandlerStore) UpdateUser(_ context.Context, _ dbq.UpdateUserParams) (dbq.User, error) {
	return dbq.User{}, pgx.ErrTxClosed
}

func TestHandler_Terminate_InternalError(t *testing.T) {
	store := newFakeAdminStore()
	store.seed(dbq.User{ID: 1, Email: "boss@x", Role: dbq.UserRoleSuperAdmin})
	store.seed(dbq.User{ID: 2, Email: "ex@x"})
	wrapped := &updateFailHandlerStore{fakeAdminStore: store}

	svc := admin.NewService(wrapped)
	h := admin.NewHandler(svc)
	eng := newAdminEngWithHandler(h, 1, permission.RoleSuperAdmin)

	w, raw := doJSON(t, eng, http.MethodPost, "/api/users/terminate", map[string]any{
		"userId": 2,
	})
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d body=%s", w.Code, raw)
	}
	var env apiresult.Envelope[any]
	_ = json.Unmarshal(raw, &env)
	if env.Details == nil || env.Details.ErrorCode != errorcode.InternalError {
		t.Fatalf("env=%+v", env)
	}
}

// newAdminEngWithHandler — 외부 store 를 이미 감싼 handler 를 받아서 engine 구성.
func newAdminEngWithHandler(h *admin.Handler, actorID int64, role permission.Role) *gin.Engine {
	eng := gin.New()
	eng.POST("/api/users/terminate", fakeAuth(actorID, 1, role), h.Terminate)
	return eng
}
