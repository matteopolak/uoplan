import { createTheme, rem, type MantineColorsTuple } from '@mantine/core';

const accentPurple: MantineColorsTuple = [
  '#F8F0FC',
  '#F3D9FA',
  '#EEBEFA',
  '#E599F7',
  '#DA77F2',
  '#CC5DE8',
  '#BE4BDB',
  '#AE3EC9',
  '#9C36B5',
  '#862E9C',
];

const constructBlack: MantineColorsTuple = [
  '#F5F2EC',
  '#E8E4DC',
  '#D4CFC5',
  '#B8B2A6',
  '#9C9588',
  '#7A736A',
  '#5C554C',
  '#3D3832',
  '#1A1A1A',
  '#0D0D0D',
];

const constructRed: MantineColorsTuple = [
  '#FFE3E3',
  '#FFC9C9',
  '#FFA8A8',
  '#FF8787',
  '#FF6B6B',
  '#FA5252',
  '#E03131',
  '#C92A2A',
  '#B02525',
  '#962020',
];

export const theme = createTheme({
  defaultRadius: 0,
  primaryColor: 'constructBlack',
  colors: {
    accentPurple,
    constructBlack,
    constructRed,
  },
  fontFamily: '"DM Mono", monospace',
  headings: {
    fontFamily: '"DM Serif Display", serif',
    fontWeight: '400',
  },
  components: {
    Button: {
      defaultProps: {
        variant: 'filled',
        radius: 0,
      },
      styles: () => ({
        root: {
          border: '2px solid #1A1A1A',
          textTransform: 'uppercase' as const,
          fontWeight: 500,
          letterSpacing: '0.05em',
          transition: 'transform 80ms ease, box-shadow 80ms ease',
          '&:hover': {
            transform: 'rotate(-1deg) scale(1.02)',
            boxShadow: '3px 3px 0px #1A1A1A',
          },
          '&:active': {
            transform: 'rotate(0deg) scale(0.98)',
            boxShadow: 'none',
          },
        },
      }),
    },
    Card: {
      styles: () => ({
        root: {
          border: '2px solid #1A1A1A',
        },
      }),
    },
    Input: {
      styles: () => ({
        input: {
          border: '2px solid #1A1A1A',
          borderRadius: 0,
          '&:focus': {
            borderColor: '#862E9C',
          },
        },
      }),
    },
    TextInput: {
      styles: () => ({
        input: {
          border: '2px solid #1A1A1A',
          borderRadius: 0,
          '&:focus': {
            borderColor: '#862E9C',
          },
        },
      }),
    },
    PasswordInput: {
      styles: () => ({
        input: {
          border: '2px solid #1A1A1A',
          borderRadius: 0,
          '&:focus': {
            borderColor: '#862E9C',
          },
        },
      }),
    },
    Select: {
      styles: () => ({
        input: {
          border: '2px solid #1A1A1A',
          borderRadius: 0,
          '&:focus': {
            borderColor: '#862E9C',
          },
        },
      }),
    },
    Modal: {
      styles: () => ({
        content: {
          border: '2px solid #1A1A1A',
          borderRadius: 0,
        },
        header: {
          borderBottom: '2px solid #1A1A1A',
        },
      }),
    },
    Badge: {
      styles: () => ({
        root: {
          borderRadius: 0,
          textTransform: 'uppercase' as const,
          fontFamily: '"DM Mono", monospace',
          fontWeight: 500,
          letterSpacing: '0.05em',
        },
      }),
    },
    Table: {
      styles: () => ({
        th: {
          borderBottom: '2px solid #1A1A1A',
          textTransform: 'uppercase' as const,
          fontFamily: '"DM Mono", monospace',
          fontSize: rem(11),
          letterSpacing: '0.08em',
          fontWeight: 500,
        },
        td: {
          borderBottom: '1px solid #D4CFC5',
        },
      }),
    },
    Drawer: {
      styles: () => ({
        content: {
          borderLeft: '2px solid #1A1A1A',
        },
        header: {
          borderBottom: '2px solid #1A1A1A',
        },
      }),
    },
  },
});

