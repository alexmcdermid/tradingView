import { Box, Button, Container, Divider, Stack, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router";

export type LegalSection = {
  title: string;
  body?: string[];
  items?: string[];
};

type LegalDocumentProps = {
  title: string;
  updatedAt: string;
  intro: string[];
  sections: LegalSection[];
};

export function LegalDocument({ title, updatedAt, intro, sections }: LegalDocumentProps) {
  return (
    <Container maxWidth="md" sx={{ py: { xs: 3, sm: 5 } }}>
      <Stack spacing={3}>
        <Box>
          <Button component={RouterLink} to="/" variant="outlined" size="small" sx={{ mb: 2 }}>
            Back to app
          </Button>
          <Typography variant="h3" component="h1" fontWeight={800} sx={{ fontSize: { xs: 32, sm: 44 } }}>
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
            Last Updated: {updatedAt}
          </Typography>
        </Box>

        <Stack spacing={1.5}>
          {intro.map((paragraph) => (
            <Typography key={paragraph} variant="body1" color="text.secondary" sx={{ lineHeight: 1.75 }}>
              {paragraph}
            </Typography>
          ))}
        </Stack>

        <Divider />

        <Stack spacing={3.5}>
          {sections.map((section, index) => (
            <Box key={section.title}>
              <Typography variant="h5" component="h2" fontWeight={800} sx={{ mb: 1.25 }}>
                {index + 1}. {section.title}
              </Typography>
              <Stack spacing={1.25}>
                {section.body?.map((paragraph) => (
                  <Typography key={paragraph} variant="body1" color="text.secondary" sx={{ lineHeight: 1.75 }}>
                    {paragraph}
                  </Typography>
                ))}
                {section.items && (
                  <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0 }}>
                    {section.items.map((item) => (
                      <Typography
                        key={item}
                        component="li"
                        variant="body1"
                        color="text.secondary"
                        sx={{ lineHeight: 1.75, mb: 0.75 }}
                      >
                        {item}
                      </Typography>
                    ))}
                  </Box>
                )}
              </Stack>
            </Box>
          ))}
        </Stack>
      </Stack>
    </Container>
  );
}
