// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Unmounts what each screen test rendered, so tests never see each other's screens.

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(cleanup);
